package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class WorkspaceAnalyticsMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_workspace_analytics")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void addsReportingIndexesWithoutRewritingTransactionalRows() {
        flyway("29").migrate();
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Analytics workspace', true)
                returning id
                """, Long.class);
        Long companyId = jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, 'Maribor', 'analytics-maribor')
                returning id
                """, Long.class, workspaceId);
        Long locationId = jdbc.queryForObject(
                "select id from locations where company_id=? and default_location=true", Long.class, companyId);
        Long beforeLocations = jdbc.queryForObject("select count(*) from locations where company_id=?", Long.class, companyId);
        Long beforeTemplates = jdbc.queryForObject("select count(*) from workspace_service_templates where workspace_id=?", Long.class, workspaceId);

        flyway(null).migrate();

        assertThat(jdbc.queryForObject("select count(*) from locations where company_id=?", Long.class, companyId))
                .isEqualTo(beforeLocations);
        assertThat(jdbc.queryForObject("select count(*) from workspace_service_templates where workspace_id=?", Long.class, workspaceId))
                .isEqualTo(beforeTemplates);
        assertThat(jdbc.queryForObject("select id from locations where id=?", Long.class, locationId)).isEqualTo(locationId);

        List<String> indexes = jdbc.queryForList("""
                select indexname from pg_indexes
                 where schemaname = current_schema()
                   and indexname like '%analytics%'
                 order by indexname
                """, String.class);
        assertThat(indexes).contains(
                "idx_session_booking_workspace_analytics",
                "idx_bills_workspace_analytics",
                "idx_clients_workspace_identity_analytics",
                "idx_users_workspace_employee_analytics",
                "idx_session_type_workspace_template_analytics");
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
