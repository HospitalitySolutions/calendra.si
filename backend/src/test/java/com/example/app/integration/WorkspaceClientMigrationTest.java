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
class WorkspaceClientMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_workspace_clients")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void migratesOneToOneSeedsReviewCandidatesAndEnforcesUnitOwnership() {
        flyway("24").migrate();
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Shared workspace', true)
                returning id
                """, Long.class);
        Long firstCompanyId = insertCompany(jdbc, workspaceId, "Maribor", "maribor");
        Long secondCompanyId = insertCompany(jdbc, workspaceId, "Ljubljana", "ljubljana");

        Long firstClientId = insertClient(jdbc, firstCompanyId, "Ana", "Novak", "ana@example.test", "+386 40 111 222");
        Long secondClientId = insertClient(jdbc, secondCompanyId, "Ana", "Novak", "ANA@example.test", "040 111 222");

        flyway(null).migrate();

        assertThat(jdbc.queryForObject(
                "select workspace_client_id from clients where id=?", Long.class, firstClientId)).isEqualTo(firstClientId);
        assertThat(jdbc.queryForObject(
                "select workspace_client_id from clients where id=?", Long.class, secondClientId)).isEqualTo(secondClientId);
        assertThat(jdbc.queryForObject(
                "select count(*) from workspace_clients where id in (?, ?)", Integer.class, firstClientId, secondClientId))
                .isEqualTo(2);
        assertThat(jdbc.queryForObject(
                "select count(*) from workspace_client_duplicate_candidates where workspace_id=? and status='PENDING'",
                Integer.class, workspaceId)).isEqualTo(1);

        // Linking is non-destructive: both local client rows remain and only the shared identity changes.
        jdbc.update("update clients set workspace_client_id=? where id=?", firstClientId, secondClientId);
        jdbc.update("update clients set email='new@example.test', phone='+38640123456' where id=?", firstClientId);
        assertThat(jdbc.queryForObject("select email from clients where id=?", String.class, secondClientId))
                .isEqualTo("new@example.test");
        assertThat(jdbc.queryForObject("select normalized_phone from workspace_clients where id=?", String.class, firstClientId))
                .isEqualTo("38640123456");

        // Raw writers that omit workspace_client_id still receive an identity through the database trigger.
        Long rawClientId = insertClient(jdbc, firstCompanyId, "Raw", "Writer", "raw@example.test", null);
        assertThat(jdbc.queryForObject(
                "select workspace_client_id from clients where id=?", Long.class, rawClientId)).isNotNull();
        jdbc.update("update clients set phone='+38640101010' where id=?", rawClientId);
        assertThat(jdbc.queryForObject(
                "select count(*) from workspace_client_audit_log where client_id=? and action='SHARED_IDENTITY_DATABASE_SYNC'",
                Integer.class, rawClientId)).isEqualTo(1);
        jdbc.update("delete from clients where id=?", rawClientId);
        assertThat(jdbc.queryForObject(
                "select count(*) from workspace_client_audit_log where client_id is null and action='SHARED_IDENTITY_DATABASE_SYNC'",
                Integer.class)).isGreaterThanOrEqualTo(1);

        Long otherWorkspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Other workspace', true)
                returning id
                """, Long.class);
        Long otherCompanyId = insertCompany(jdbc, otherWorkspaceId, "Koper", "koper");
        Long otherClientId = insertClient(jdbc, otherCompanyId, "Other", "Person", "other@example.test", null);
        assertThatThrownBy(() -> jdbc.update(
                "update clients set workspace_client_id=? where id=?", firstClientId, otherClientId))
                .isInstanceOf(DataIntegrityViolationException.class);

        // New cross-unit writes are rejected even though historical constraints are installed NOT VALID.
        assertThatThrownBy(() -> jdbc.update("""
                insert into client_messages(
                    created_at, updated_at, company_id, client_id, channel, direction, status,
                    recipient, body, conversation_closed, conversation_starred, internal_note, visibility_scope
                ) values (current_timestamp, current_timestamp, ?, ?, 'EMAIL', 'OUTBOUND', 'SENT',
                          '', 'Should fail', false, false, true, 'UNIT_ONLY')
                """, firstCompanyId, secondClientId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private Long insertCompany(JdbcTemplate jdbc, Long workspaceId, String name, String code) {
        return jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, ?, ?)
                returning id
                """, Long.class, workspaceId, name, code);
    }

    private Long insertClient(
            JdbcTemplate jdbc,
            Long companyId,
            String firstName,
            String lastName,
            String email,
            String phone
    ) {
        return jdbc.queryForObject("""
                insert into clients(
                    created_at, updated_at, company_id, first_name, last_name, email, phone,
                    whatsapp_opt_in, viber_connected, anonymized, active, batch_payment_enabled,
                    inbox_starred, inbox_closed, invoice_recipient_type,
                    suppress_invoice_emails, online_booking_blocked
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?, ?, ?,
                    false, false, false, true, false, false, false, 'PERSON', false, false
                ) returning id
                """, Long.class, companyId, firstName, lastName, email, phone);
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
