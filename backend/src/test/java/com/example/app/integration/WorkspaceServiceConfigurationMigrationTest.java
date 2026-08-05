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
class WorkspaceServiceConfigurationMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_workspace_services")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void backfillsOneToOneTemplatesAndEnforcesWorkspaceAndUnitOfferingOwnership() {
        flyway("28").migrate();
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = insertWorkspace(jdbc, "Shared services");
        Long mariborId = insertCompany(jdbc, workspaceId, "Maribor", "phase5-maribor");
        Long ljubljanaId = insertCompany(jdbc, workspaceId, "Ljubljana", "phase5-ljubljana");
        Long mariborTypeId = insertSessionType(jdbc, mariborId, "CONSULT", "Consultation");
        Long ljubljanaTypeId = insertSessionType(jdbc, ljubljanaId, "CONSULT", "Consultation");

        flyway(null).migrate();

        assertThat(jdbc.queryForObject("select count(*) from workspace_service_templates where workspace_id=?",
                Integer.class, workspaceId)).isEqualTo(2);
        Long mariborTemplateId = jdbc.queryForObject(
                "select workspace_service_template_id from session_type where id=?", Long.class, mariborTypeId);
        Long ljubljanaTemplateId = jdbc.queryForObject(
                "select workspace_service_template_id from session_type where id=?", Long.class, ljubljanaTypeId);
        assertThat(mariborTemplateId).isNotEqualTo(ljubljanaTemplateId);
        assertThat(jdbc.queryForObject(
                "select available_all_locations from session_type where id=?", Boolean.class, mariborTypeId))
                .isTrue();

        Long mariborLocationId = jdbc.queryForObject(
                "select id from locations where company_id=? and default_location=true", Long.class, mariborId);
        Long ljubljanaLocationId = jdbc.queryForObject(
                "select id from locations where company_id=? and default_location=true", Long.class, ljubljanaId);
        jdbc.update("update session_type set available_all_locations=false where id=?", mariborTypeId);
        jdbc.update("insert into session_type_locations(session_type_id, location_id) values (?, ?)",
                mariborTypeId, mariborLocationId);
        assertThatThrownBy(() -> jdbc.update(
                "insert into session_type_locations(session_type_id, location_id) values (?, ?)",
                mariborTypeId, ljubljanaLocationId))
                .isInstanceOf(DataIntegrityViolationException.class);

        // Linking equivalent offerings across units is non-destructive and explicitly allowed.
        jdbc.update("update session_type set workspace_service_template_id=? where id=?", mariborTemplateId, ljubljanaTypeId);
        assertThat(jdbc.queryForObject("select workspace_service_template_id from session_type where id=?",
                Long.class, ljubljanaTypeId)).isEqualTo(mariborTemplateId);

        // One workspace service can have only one offering per operating unit.
        Long secondLjubljanaTypeId = insertSessionType(jdbc, ljubljanaId, "OTHER", "Other service");
        assertThatThrownBy(() -> jdbc.update(
                "update session_type set workspace_service_template_id=? where id=?",
                mariborTemplateId, secondLjubljanaTypeId))
                .isInstanceOf(DataIntegrityViolationException.class);

        // A unit offering may never reference another workspace's service template.
        Long otherWorkspaceId = insertWorkspace(jdbc, "Other workspace");
        Long otherCompanyId = insertCompany(jdbc, otherWorkspaceId, "Koper", "phase5-koper");
        Long otherTypeId = insertSessionType(jdbc, otherCompanyId, "OTHER", "Other workspace service");
        Long otherTemplateId = jdbc.queryForObject(
                "select workspace_service_template_id from session_type where id=?", Long.class, otherTypeId);
        assertThatThrownBy(() -> jdbc.update(
                "update session_type set workspace_service_template_id=? where id=?",
                otherTemplateId, mariborTypeId))
                .isInstanceOf(DataIntegrityViolationException.class);

        // Legacy/raw writers that omit the link receive a one-to-one workspace template automatically.
        Long rawTypeId = insertSessionType(jdbc, mariborId, "RAW", "Raw service");
        assertThat(jdbc.queryForObject(
                "select workspace_service_template_id from session_type where id=?", Long.class, rawTypeId))
                .isNotNull();
        assertThat(jdbc.queryForObject(
                "select count(*) from configuration_copy_audit_log", Integer.class)).isZero();
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

    private Long insertSessionType(JdbcTemplate jdbc, Long companyId, String code, String description) {
        return jdbc.queryForObject("""
                insert into session_type(
                    created_at, updated_at, company_id, name, description, color, duration_minutes,
                    break_minutes, break_minutes_overridden, widget_group_booking_enabled,
                    guest_booking_enabled, group_booking_enabled, price_calculation_mode,
                    guest_sort_order, active
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?, '#D7DFF0', 60,
                    0, false, false, true, false, 'PER_CLIENT', 0, true
                ) returning id
                """, Long.class, companyId, code, description);
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
