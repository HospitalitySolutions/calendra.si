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
class FlywayUpgradeMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_upgrade")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void upgradesV8SchemaAndRemovesOnlyEmptyLegacyWaitlistTables() {
        Flyway firstStage = flyway("8");
        firstStage.migrate();

        JdbcTemplate jdbc = jdbc();
        assertThat(jdbc.queryForObject("select to_regclass('public.waitlist_request') is not null", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select to_regclass('public.waitlist_requests') is not null", Boolean.class)).isTrue();

        flyway(null).migrate();

        assertThat(jdbc.queryForObject("select to_regclass('public.waitlist_request') is null", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject("select to_regclass('public.waitlist_requests') is not null", Boolean.class)).isTrue();
        assertThat(numericScale(jdbc, "open_bill_items", "unit_gross_price")).isEqualTo(2);
        assertThat(numericScale(jdbc, "open_bill_items", "net_price")).isEqualTo(4);
        assertThat(numericScale(jdbc, "bill_item", "gross_price")).isEqualTo(2);
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
        DriverManagerDataSource ds = new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword());
        return new JdbcTemplate(ds);
    }

    private int numericScale(JdbcTemplate jdbc, String table, String column) {
        Integer scale = jdbc.queryForObject("""
                select numeric_scale
                from information_schema.columns
                where table_schema = 'public' and table_name = ? and column_name = ?
                """, Integer.class, table, column);
        return scale == null ? -1 : scale;
    }
}
