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
class ActivityLogMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_activity_log")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void migrationCreatesIndexedTenantScopedAuditTableAndCompanyDeleteCascades() {
        flyway("39").migrate();
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Audit workspace', true)
                returning id
                """, Long.class);
        Long companyId = jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, 'Maribor', 'audit-maribor')
                returning id
                """, Long.class, workspaceId);

        flyway(null).migrate();

        Long activityId = jdbc.queryForObject("""
                insert into activity_logs(
                    workspace_id, company_id, actor_type, actor_name_snapshot,
                    module, action_code, entity_type, entity_id, entity_label,
                    summary, details_json, source, occurred_at
                ) values (?, ?, 'USER', 'David Mirc', 'CLIENTS', 'CLIENT_CREATED',
                    'CLIENT', 101, 'Janez Novak', 'Created client',
                    '{"targetPath":"/clients/101"}', 'WEB_APP', current_timestamp)
                returning id
                """, Long.class, workspaceId, companyId);

        assertThat(jdbc.queryForObject(
                "select company_id from activity_logs where id=?", Long.class, activityId))
                .isEqualTo(companyId);
        assertThat(jdbc.queryForObject(
                "select details_json from activity_logs where id=?", String.class, activityId))
                .contains("targetPath");

        List<String> indexes = jdbc.queryForList("""
                select indexname from pg_indexes
                 where schemaname = current_schema()
                   and indexname in (
                       'idx_activity_logs_workspace_time',
                       'idx_activity_logs_company_time',
                       'idx_activity_logs_actor_time',
                       'idx_activity_logs_entity_time',
                       'idx_activity_logs_location_time',
                       'idx_activity_logs_module_time',
                       'idx_activity_logs_action_time'
                   )
                """, String.class);
        assertThat(indexes).containsExactlyInAnyOrder(
                "idx_activity_logs_workspace_time",
                "idx_activity_logs_company_time",
                "idx_activity_logs_actor_time",
                "idx_activity_logs_entity_time",
                "idx_activity_logs_location_time",
                "idx_activity_logs_module_time",
                "idx_activity_logs_action_time"
        );

        jdbc.update("delete from company where id=?", companyId);
        assertThat(jdbc.queryForObject(
                "select count(*) from activity_logs where id=?", Integer.class, activityId))
                .isZero();
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
