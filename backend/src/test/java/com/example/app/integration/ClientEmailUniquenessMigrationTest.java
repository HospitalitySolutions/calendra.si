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
class ClientEmailUniquenessMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_client_email_unique")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void preventsNewDuplicateEmailsPerTenantWithoutBreakingHistoricalDuplicates() {
        flyway("55").migrate();
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Workspace', true)
                returning id
                """, Long.class);
        Long tenantA = insertCompany(jdbc, workspaceId, "Tenant A", "tenant-a");
        Long tenantB = insertCompany(jdbc, workspaceId, "Tenant B", "tenant-b");

        // Simulate duplicates that may already exist on an upgraded installation.
        Long firstLegacy = insertClient(jdbc, tenantA, "First", "Legacy", " Same@Example.com ");
        Long secondLegacy = insertClient(jdbc, tenantA, "Second", "Legacy", "same@example.com");

        flyway(null).migrate();

        assertThat(jdbc.queryForObject("""
                select count(*) from clients
                 where company_id=? and lower(trim(email))='same@example.com'
                """, Integer.class, tenantA)).isEqualTo(2);

        // An unrelated edit of a historical duplicate must still work.
        jdbc.update("update clients set last_name='Legacy edited' where id=?", secondLegacy);
        assertThat(jdbc.queryForObject("select last_name from clients where id=?", String.class, secondLegacy))
                .isEqualTo("Legacy edited");

        // But no third client may be inserted with that tenant-local email identity.
        assertThatThrownBy(() -> insertClient(jdbc, tenantA, "Third", "Duplicate", "SAME@example.com"))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("duplicate client email for tenant");

        // A different email can still be created normally.
        Long uniqueClient = insertClient(jdbc, tenantA, "Unique", "Person", "unique@example.com");
        assertThat(uniqueClient).isNotNull();

        // Updating another client onto an occupied email is also rejected.
        assertThatThrownBy(() -> jdbc.update(
                "update clients set email=' same@example.com ' where id=?", uniqueClient))
                .isInstanceOf(DataIntegrityViolationException.class)
                .hasMessageContaining("duplicate client email for tenant");

        // Email uniqueness is tenant-scoped, not workspace-global.
        Long otherTenantClient = insertClient(jdbc, tenantB, "Other", "Tenant", "same@example.com");
        assertThat(otherTenantClient).isNotNull();

        // Internal COMPANY billing/proxy rows are not guest identities and must not be
        // blocked merely because two companies use the same finance contact email.
        Long billingA = insertCompanyRecipientClient(jdbc, tenantB, "billing@example.com");
        Long billingB = insertCompanyRecipientClient(jdbc, tenantB, "billing@example.com");
        assertThat(billingA).isNotEqualTo(billingB);

        assertThat(jdbc.queryForObject("""
                select count(*) from pg_trigger
                 where tgname='trg_clients_unique_email_per_tenant' and not tgisinternal
                """, Integer.class)).isEqualTo(1);

        assertThat(firstLegacy).isNotNull();
    }

    private Long insertCompany(JdbcTemplate jdbc, Long workspaceId, String name, String code) {
        return jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, ?, ?)
                returning id
                """, Long.class, workspaceId, name, code);
    }

    private Long insertClient(JdbcTemplate jdbc, Long companyId, String firstName, String lastName, String email) {
        return jdbc.queryForObject("""
                insert into clients(
                    created_at, updated_at, company_id, first_name, last_name, email,
                    whatsapp_opt_in, viber_connected, anonymized, active, batch_payment_enabled,
                    inbox_starred, inbox_closed, invoice_recipient_type,
                    suppress_invoice_emails, online_booking_blocked
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?, ?,
                    false, false, false, true, false, false, false, 'PERSON', false, false
                ) returning id
                """, Long.class, companyId, firstName, lastName, email);
    }

    private Long insertCompanyRecipientClient(JdbcTemplate jdbc, Long companyId, String email) {
        return jdbc.queryForObject("""
                insert into clients(
                    created_at, updated_at, company_id, first_name, last_name, email,
                    whatsapp_opt_in, viber_connected, anonymized, active, batch_payment_enabled,
                    inbox_starred, inbox_closed, invoice_recipient_type,
                    suppress_invoice_emails, online_booking_blocked
                ) values (
                    current_timestamp, current_timestamp, ?, 'Company', 'Billing', ?,
                    false, false, false, false, true, false, false, 'COMPANY', false, false
                ) returning id
                """, Long.class, companyId, email);
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
