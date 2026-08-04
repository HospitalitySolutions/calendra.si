package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class WorkspaceLoginAccountMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_multi_unit_migration")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void preservesLegacyIdsAndLinksSecuritySessions() {
        flyway("23").migrate();
        JdbcTemplate jdbc = jdbc();

        Long companyId = jdbc.queryForObject("""
                insert into company(created_at, updated_at, name, tenant_code)
                values (current_timestamp, current_timestamp, 'Legacy unit', 'legacy-unit')
                returning id
                """, Long.class);
        Long userId = jdbc.queryForObject("""
                insert into users(
                    created_at, updated_at, company_id, first_name, last_name, email,
                    password_hash, role, active, consultant
                ) values (
                    current_timestamp, current_timestamp, ?, 'Legacy', 'Owner', 'owner@example.test',
                    '$2a$10$legacyHashForMigrationOnly', 'ADMIN', true, false
                ) returning id
                """, Long.class, companyId);
        Long sessionId = jdbc.queryForObject("""
                insert into user_security_sessions(
                    created_at, updated_at, user_id, session_key, issued_at, last_seen_at
                ) values (
                    current_timestamp, current_timestamp, ?, 'legacy-session', current_timestamp, current_timestamp
                ) returning id
                """, Long.class, userId);

        flyway(null).migrate();

        assertThat(jdbc.queryForObject(
                "select workspace_id from company where id=?", Long.class, companyId)).isEqualTo(companyId);
        assertThat(jdbc.queryForObject(
                "select id from workspaces where id=?", Long.class, companyId)).isEqualTo(companyId);
        assertThat(jdbc.queryForObject(
                "select login_account_id from users where id=?", Long.class, userId)).isEqualTo(userId);
        assertThat(jdbc.queryForObject(
                "select id from login_accounts where id=?", Long.class, userId)).isEqualTo(userId);
        assertThat(jdbc.queryForObject(
                "select login_account_id from user_security_sessions where id=?", Long.class, sessionId)).isEqualTo(userId);
        assertThat(jdbc.queryForObject(
                "select last_selected_company_id from login_accounts where id=?", Long.class, userId)).isEqualTo(companyId);
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
