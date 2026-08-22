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
class FlywayBaselineMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_baseline")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void emptyPostgresMigratesToCanonicalV1WithoutLegacySchema() {
        Flyway flyway = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .baselineOnMigrate(false)
                .cleanDisabled(true)
                .load();

        var result = flyway.migrate();
        assertThat(result.success).isTrue();
        assertThat(result.migrationsExecuted).isEqualTo(1);
        flyway.validate();

        JdbcTemplate jdbc = jdbc();
        assertThat(jdbc.queryForObject(
                "select count(*) from flyway_schema_history where success and version='1'", Long.class))
                .isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "select count(*) from flyway_schema_history where success and version is not null", Long.class))
                .isEqualTo(1L);

        assertTableExists(jdbc, "workspaces");
        assertTableExists(jdbc, "locations");
        assertTableExists(jdbc, "session_booking");
        assertTableExists(jdbc, "session_service");
        assertTableExists(jdbc, "invoice_series");
        assertTableExists(jdbc, "workspace_subscriptions");
        assertTableExists(jdbc, "activity_logs");
        assertTableExists(jdbc, "guest_location_subscriptions");

        assertTableMissing(jdbc, "waitlist_request");
        assertTableMissing(jdbc, "workspace_subscription_legacy_sources");
        assertColumnExists(jdbc, "workspace_subscriptions", "billing_owner_company_id");
        assertColumnMissing(jdbc, "workspace_subscriptions", "legacy_primary_company_id");
        assertColumnMissing(jdbc, "consumable", "location");
        assertColumnMissing(jdbc, "consumable", "current_stock");
        assertColumnMissing(jdbc, "consumable", "minimum_stock");
        assertColumnMissing(jdbc, "consumable", "cost_price");

        assertThat(jdbc.queryForObject("""
                select count(*)
                  from pg_trigger
                 where tgname = 'trg_fill_session_consumable_billing_snapshots'
                   and not tgisinternal
                """, Long.class)).isZero();
        assertThat(jdbc.queryForObject(
                "select to_regprocedure('fill_session_consumable_billing_snapshots()') is null", Boolean.class))
                .isTrue();
        assertThat(jdbc.queryForObject(
                "select to_regprocedure('enforce_client_email_unique_per_tenant()') is null", Boolean.class))
                .isTrue();
        assertThat(jdbc.queryForObject(
                "select count(*) from pg_indexes where schemaname='public' and indexname='uq_clients_company_normalized_email'",
                Long.class)).isOne();

        assertThat(numericScale(jdbc, "open_bill_items", "net_price")).isEqualTo(4);
        assertThat(numericScale(jdbc, "open_bill_items", "unit_gross_price")).isEqualTo(2);
        assertThat(numericScale(jdbc, "bill_item", "gross_price")).isEqualTo(2);

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Baseline workspace', true)
                returning id
                """, Long.class);
        Long companyId = jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, 'Baseline company', 'baseline-company')
                returning id
                """, Long.class, workspaceId);

        assertThat(jdbc.queryForObject(
                "select count(*) from workspace_subscriptions where workspace_id=?", Long.class, workspaceId))
                .isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "select billing_owner_company_id from workspace_subscriptions where workspace_id=?", Long.class, workspaceId))
                .isEqualTo(companyId);
    }

    private JdbcTemplate jdbc() {
        return new JdbcTemplate(new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
    }

    private void assertTableExists(JdbcTemplate jdbc, String table) {
        assertThat(jdbc.queryForObject("select to_regclass('public.' || ?) is not null", Boolean.class, table)).isTrue();
    }

    private void assertTableMissing(JdbcTemplate jdbc, String table) {
        assertThat(jdbc.queryForObject("select to_regclass('public.' || ?) is null", Boolean.class, table)).isTrue();
    }

    private void assertColumnExists(JdbcTemplate jdbc, String table, String column) {
        assertThat(columnCount(jdbc, table, column)).isOne();
    }

    private void assertColumnMissing(JdbcTemplate jdbc, String table, String column) {
        assertThat(columnCount(jdbc, table, column)).isZero();
    }

    private long columnCount(JdbcTemplate jdbc, String table, String column) {
        Long count = jdbc.queryForObject("""
                select count(*)
                  from information_schema.columns
                 where table_schema='public' and table_name=? and column_name=?
                """, Long.class, table, column);
        return count == null ? 0 : count;
    }

    private int numericScale(JdbcTemplate jdbc, String table, String column) {
        Integer scale = jdbc.queryForObject("""
                select numeric_scale
                  from information_schema.columns
                 where table_schema='public' and table_name=? and column_name=?
                """, Integer.class, table, column);
        return scale == null ? -1 : scale;
    }
}
