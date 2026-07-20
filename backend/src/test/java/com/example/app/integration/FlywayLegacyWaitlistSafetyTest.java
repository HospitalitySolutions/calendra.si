package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class FlywayLegacyWaitlistSafetyTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_legacy_waitlist")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void refusesToDropNonEmptyLegacyWaitlistTables() {
        flyway("8").migrate();
        JdbcTemplate jdbc = jdbc();

        // The safety gate only needs to prove that a legacy row exists. Disable FK
        // enforcement for this deliberately synthetic migration fixture.
        jdbc.execute("set session_replication_role = replica");
        try {
            jdbc.update("""
                    insert into waitlist_request (
                        company_id, target_type, date_from, date_to,
                        employee_preference_type, requested_participants, status, source
                    ) values (999999, 'FLEXIBLE', current_date, current_date,
                              'ANY', 1, 'ACTIVE', 'STAFF')
                    """);
        } finally {
            jdbc.execute("set session_replication_role = origin");
        }

        assertThatThrownBy(() -> flyway(null).migrate())
                .hasMessageContaining("Legacy table waitlist_request")
                .hasMessageContaining("Migrate these rows");

        assertThat(jdbc.queryForObject("select count(*) from waitlist_request", Long.class)).isEqualTo(1L);
        assertThat(jdbc.queryForObject(
                "select to_regclass('public.waitlist_request') is not null", Boolean.class)).isTrue();
        assertThat(jdbc.queryForObject(
                "select count(*) from flyway_schema_history where version = '9' and success", Long.class)).isZero();
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
