package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class LegalEntityInvoiceSeriesMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_invoice_issuers")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void preservesHistoricalInvoicesAndEnforcesIssuerSeriesAndLocationOwnership() {
        flyway("27").migrate();
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = insertWorkspace(jdbc, "Billing workspace");
        Long companyId = insertCompany(jdbc, workspaceId, "Maribor", "phase4-maribor");
        Long locationId = jdbc.queryForObject(
                "select id from locations where company_id=? and default_location=true", Long.class, companyId);
        Long userId = insertUser(jdbc, companyId, "owner@phase4.test");

        insertSetting(jdbc, companyId, "INVOICE_COUNTER", "INV-0042");
        insertSetting(jdbc, companyId, "COMPANY_ADDRESS", "Main Street 1");
        insertSetting(jdbc, companyId, "COMPANY_POSTAL_CODE", "2000");
        insertSetting(jdbc, companyId, "COMPANY_CITY", "Maribor");
        insertSetting(jdbc, companyId, "COMPANY_VAT_ID", "SI12345678");
        insertSetting(jdbc, companyId, "COMPANY_IBAN", "SI56191000000123456");

        Long historicalBillId = insertHistoricalBill(jdbc, companyId, userId, "INV-0041");
        Long certificateId = jdbc.queryForObject("""
                insert into fiscal_certificates(
                    created_at, updated_at, company_id, file_name, content_type, certificate_data_bytes
                ) values (current_timestamp, current_timestamp, ?, 'issuer.p12', 'application/x-pkcs12', decode('00', 'hex'))
                returning id
                """, Long.class, companyId);

        flyway(null).migrate();

        Long legalEntityId = jdbc.queryForObject(
                "select legal_entity_id from company_legal_entities where company_id=? and default_issuer=true", Long.class, companyId);
        Long defaultSeriesId = jdbc.queryForObject(
                "select default_invoice_series_id from company_legal_entities where company_id=? and legal_entity_id=?",
                Long.class, companyId, legalEntityId);

        assertThat(jdbc.queryForObject("select next_number from invoice_series where id=?", String.class, defaultSeriesId))
                .isEqualTo("INV-0042");
        assertThat(jdbc.queryForObject("select bill_number from bills where id=?", String.class, historicalBillId))
                .isEqualTo("INV-0041");
        assertThat(jdbc.queryForObject("select legal_entity_id from bills where id=?", Long.class, historicalBillId))
                .isEqualTo(legalEntityId);
        assertThat(jdbc.queryForObject("select invoice_series_id from bills where id=?", Long.class, historicalBillId))
                .isEqualTo(defaultSeriesId);
        assertThat(jdbc.queryForObject("select location_id from bills where id=?", Long.class, historicalBillId))
                .isEqualTo(locationId);
        assertThat(jdbc.queryForObject("select issuer_name_snapshot from bills where id=?", String.class, historicalBillId))
                .isEqualTo("Maribor");
        assertThat(jdbc.queryForObject("select issuer_iban_snapshot from bills where id=?", String.class, historicalBillId))
                .isEqualTo("SI56191000000123456");
        assertThat(jdbc.queryForObject("select legal_entity_id from fiscal_certificates where id=?", Long.class, certificateId))
                .isEqualTo(legalEntityId);

        Long secondSeriesId = jdbc.queryForObject("""
                insert into invoice_series(
                    created_at, updated_at, workspace_id, legal_entity_id, company_id, name,
                    next_number, initial_number, reset_policy, last_reset_year, active
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?, 'Secondary',
                    'INV-0042', 'INV-0001', 'NONE', extract(year from current_date)::integer, true
                ) returning id
                """, Long.class, workspaceId, legalEntityId, companyId);

        // The same visible number is valid in another explicitly selected series.
        Long secondSeriesBillId = insertBill(
                jdbc, companyId, userId, "INV-0041", legalEntityId, secondSeriesId, locationId);
        assertThat(secondSeriesBillId).isPositive();

        // It remains unique inside one numbering series.
        assertThatThrownBy(() -> insertBill(
                jdbc, companyId, userId, "INV-0041", legalEntityId, secondSeriesId, locationId))
                .isInstanceOf(DataIntegrityViolationException.class);

        // Historical issuer identity and numbering cannot be rewritten after issuance.
        assertThatThrownBy(() -> jdbc.update(
                "update bills set issuer_name_snapshot='Changed issuer' where id=?", historicalBillId))
                .isInstanceOf(DataIntegrityViolationException.class);

        // A configured unit default must stay active, unit-wide and usable.
        assertThatThrownBy(() -> jdbc.update(
                "update invoice_series set active=false where id=?", defaultSeriesId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "update invoice_series set location_id=? where id=?", locationId, defaultSeriesId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "update company_legal_entities set active=false where company_id=? and legal_entity_id=?",
                companyId, legalEntityId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "update legal_entities set active=false where id=?", legalEntityId))
                .isInstanceOf(DataIntegrityViolationException.class);

        Long alternateIssuerId = jdbc.queryForObject("""
                insert into legal_entities(
                    created_at, updated_at, workspace_id, name, country, currency, fiscal_environment, active
                ) values (current_timestamp, current_timestamp, ?, 'Alternate issuer', 'SI', 'EUR', 'TEST', true)
                returning id
                """, Long.class, workspaceId);
        Long alternateAssignmentId = jdbc.queryForObject("""
                insert into company_legal_entities(
                    created_at, updated_at, company_id, legal_entity_id, default_issuer, active
                ) values (current_timestamp, current_timestamp, ?, ?, false, true)
                returning id
                """, Long.class, companyId, alternateIssuerId);
        jdbc.update("update locations set default_legal_entity_id=? where id=?", alternateIssuerId, locationId);
        assertThatThrownBy(() -> jdbc.update(
                "update company_legal_entities set active=false where id=?", alternateAssignmentId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "delete from company_legal_entities where id=?", alternateAssignmentId))
                .isInstanceOf(DataIntegrityViolationException.class);
        jdbc.update("update locations set default_legal_entity_id=? where id=?", legalEntityId, locationId);

        Long otherWorkspaceId = insertWorkspace(jdbc, "Other workspace");
        Long otherCompanyId = insertCompany(jdbc, otherWorkspaceId, "Koper", "phase4-koper");
        assertThatThrownBy(() -> jdbc.update("""
                insert into company_legal_entities(
                    created_at, updated_at, company_id, legal_entity_id, default_issuer, active
                ) values (current_timestamp, current_timestamp, ?, ?, false, true)
                """, otherCompanyId, legalEntityId))
                .isInstanceOf(DataIntegrityViolationException.class);

        // Raw/new tenant provisioning receives a complete billing foundation.
        Long newCompanyId = insertCompany(jdbc, workspaceId, "Ljubljana", "phase4-ljubljana");
        assertThat(jdbc.queryForObject(
                "select count(*) from company_legal_entities where company_id=? and default_issuer=true and active=true",
                Integer.class, newCompanyId)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select count(*) from invoice_series where company_id=? and active=true",
                Integer.class, newCompanyId)).isEqualTo(1);
        assertThat(jdbc.queryForObject(
                "select count(*) from locations where company_id=? and default_location=true and default_legal_entity_id is not null",
                Integer.class, newCompanyId)).isEqualTo(1);
        Long newCompanyLegalEntityId = jdbc.queryForObject(
                "select legal_entity_id from company_legal_entities where company_id=? and default_issuer=true",
                Long.class, newCompanyId);
        assertThatThrownBy(() -> jdbc.update(
                "update locations set default_legal_entity_id=? where id=?", newCompanyLegalEntityId, locationId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private Long insertWorkspace(JdbcTemplate jdbc, String name) {
        return jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, ?, true)
                returning id
                """, Long.class, name);
    }

    private Long insertCompany(JdbcTemplate jdbc, Long workspaceId, String name, String tenantCode) {
        return jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, ?, ?)
                returning id
                """, Long.class, workspaceId, name, tenantCode);
    }

    private Long insertUser(JdbcTemplate jdbc, Long companyId, String email) {
        Long loginId = jdbc.queryForObject("""
                insert into login_accounts(
                    created_at, updated_at, first_name, last_name, email, password_hash, active, last_selected_company_id
                ) values (
                    current_timestamp, current_timestamp, 'Billing', 'Owner', ?, '$2a$10$phase4MigrationOnly', true, ?
                ) returning id
                """, Long.class, email, companyId);
        return jdbc.queryForObject("""
                insert into users(
                    created_at, updated_at, company_id, login_account_id, first_name, last_name, email,
                    password_hash, role, active, consultant
                ) values (
                    current_timestamp, current_timestamp, ?, ?, 'Billing', 'Owner', ?,
                    '$2a$10$phase4MigrationOnly', 'ADMIN', true, true
                ) returning id
                """, Long.class, companyId, loginId, email);
    }

    private void insertSetting(JdbcTemplate jdbc, Long companyId, String key, String value) {
        jdbc.update("""
                insert into app_settings(created_at, updated_at, company_id, key, value)
                values (current_timestamp, current_timestamp, ?, ?, ?)
                """, companyId, key, value);
    }

    private Long insertHistoricalBill(JdbcTemplate jdbc, Long companyId, Long consultantId, String billNumber) {
        return jdbc.queryForObject("""
                insert into bills(
                    created_at, updated_at, company_id, bill_number, bill_type,
                    client_first_name_snapshot, client_last_name_snapshot,
                    consultant_id, issue_date, total_net, total_gross,
                    payment_status, fiscal_status
                ) values (
                    current_timestamp, current_timestamp, ?, ?, 'INVOICE',
                    'Historical', 'Client', ?, current_date, 10.00, 12.20,
                    'paid', 'NOT_SENT'
                ) returning id
                """, Long.class, companyId, billNumber, consultantId);
    }

    private Long insertBill(
            JdbcTemplate jdbc,
            Long companyId,
            Long consultantId,
            String billNumber,
            Long legalEntityId,
            Long invoiceSeriesId,
            Long locationId
    ) {
        return jdbc.queryForObject("""
                insert into bills(
                    created_at, updated_at, company_id, bill_number, bill_type,
                    client_first_name_snapshot, client_last_name_snapshot,
                    consultant_id, issue_date, total_net, total_gross,
                    payment_status, fiscal_status, legal_entity_id, invoice_series_id, location_id
                ) values (
                    current_timestamp, current_timestamp, ?, ?, 'INVOICE',
                    'Historical', 'Client', ?, current_date, 10.00, 12.20,
                    'paid', 'NOT_SENT', ?, ?, ?
                ) returning id
                """, Long.class, companyId, billNumber, consultantId, legalEntityId, invoiceSeriesId, locationId);
    }

    private Flyway flyway(String target) {
        var configuration = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0");
        if (target != null) configuration.target(target);
        return configuration.load();
    }

    private JdbcTemplate jdbc() {
        return new JdbcTemplate(new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
    }
}
