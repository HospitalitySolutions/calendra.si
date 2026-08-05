package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class WorkspacePublicBookingMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_workspace_public_booking")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void seedsDisabledWorkspacePageAndPreservesExistingUnitConfiguration() {
        flyway("30").migrate();
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Booking workspace', true)
                returning id
                """, Long.class);
        Long companyId = jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, 'Maribor', 'booking-maribor')
                returning id
                """, Long.class, workspaceId);
        Long locationId = jdbc.queryForObject(
                "select id from locations where company_id=? and default_location=true", Long.class, companyId);
        Long locationsBefore = jdbc.queryForObject(
                "select count(*) from locations where company_id=?", Long.class, companyId);

        flyway(null).migrate();

        assertThat(jdbc.queryForObject("""
                select slug from workspace_public_booking_settings where workspace_id=?
                """, String.class, workspaceId)).isEqualTo("workspace-" + workspaceId);
        assertThat(jdbc.queryForObject("""
                select enabled from workspace_public_booking_settings where workspace_id=?
                """, Boolean.class, workspaceId)).isFalse();
        assertThat(jdbc.queryForObject("""
                select workspace_public_booking_enabled from company where id=?
                """, Boolean.class, companyId)).isTrue();
        assertThat(jdbc.queryForObject(
                "select count(*) from locations where company_id=?", Long.class, companyId)).isEqualTo(locationsBefore);
        assertThat(jdbc.queryForObject("select id from locations where id=?", Long.class, locationId)).isEqualTo(locationId);

        List<String> indexes = jdbc.queryForList("""
                select indexname from pg_indexes
                 where schemaname = current_schema()
                   and indexname in (
                       'ux_workspace_public_booking_slug_lower',
                       'ix_company_workspace_public_booking',
                       'ix_location_public_workspace_booking',
                       'ix_session_type_workspace_public_booking'
                   )
                 order by indexname
                """, String.class);
        assertThat(indexes).containsExactlyInAnyOrder(
                "ux_workspace_public_booking_slug_lower",
                "ix_company_workspace_public_booking",
                "ix_location_public_workspace_booking",
                "ix_session_type_workspace_public_booking");

        assertThatThrownBy(() -> jdbc.update("""
                update workspace_public_booking_settings
                   set location_selection_mode='INVALID'
                 where workspace_id=?
                """, workspaceId)).isInstanceOf(DataIntegrityViolationException.class);
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
