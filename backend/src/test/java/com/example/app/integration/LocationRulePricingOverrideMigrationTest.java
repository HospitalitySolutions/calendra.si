package com.example.app.integration;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.configuration.FluentConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

@Testcontainers(disabledWithoutDocker = true)
class LocationRulePricingOverrideMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_location_overrides")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void locationOverridesAreOptionalAndTenantSafe() {
        migrate("51");
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, '5.5E migration', true)
                returning id
                """, Long.class);
        Long companyId = insertCompany(jdbc, workspaceId, "Company A", "location-overrides-a");
        Long locationId = defaultLocation(jdbc, companyId);
        Long typeId = insertSessionType(jdbc, companyId, "SERVICE-A", "Service A");
        Long transactionServiceId = insertTransactionService(jdbc, companyId, "BILL-A");
        link(jdbc, typeId, transactionServiceId, new BigDecimal("40.0000"));

        Long company2Id = insertCompany(jdbc, workspaceId, "Company B", "location-overrides-b");
        Long company2LocationId = defaultLocation(jdbc, company2Id);

        migrate(null);

        assertThat(tableExists(jdbc, "location_setting_overrides")).isTrue();
        assertThat(tableExists(jdbc, "session_type_location_prices")).isTrue();

        jdbc.update("""
                insert into location_setting_overrides(
                    created_at, updated_at, company_id, location_id, setting_key, value
                ) values (current_timestamp, current_timestamp, ?, ?, 'DEFAULT_SERVICE_BREAK_MINUTES', '15')
                """, companyId, locationId);
        assertThat(jdbc.queryForObject("""
                select value from location_setting_overrides
                where company_id=? and location_id=? and setting_key='DEFAULT_SERVICE_BREAK_MINUTES'
                """, String.class, companyId, locationId)).isEqualTo("15");

        jdbc.update("""
                insert into session_type_location_prices(
                    created_at, updated_at, company_id, session_type_id,
                    transaction_service_id, location_id, price
                ) values (current_timestamp, current_timestamp, ?, ?, ?, ?, 35.0000)
                """, companyId, typeId, transactionServiceId, locationId);
        assertThat(jdbc.queryForObject("""
                select price from session_type_location_prices
                where session_type_id=? and transaction_service_id=? and location_id=?
                """, BigDecimal.class, typeId, transactionServiceId, locationId))
                .isEqualByComparingTo("35.0000");

        assertThatThrownBy(() -> jdbc.update("""
                insert into location_setting_overrides(
                    created_at, updated_at, company_id, location_id, setting_key, value
                ) values (current_timestamp, current_timestamp, ?, ?, 'WAITLIST_SETTINGS_JSON', '{}')
                """, companyId, company2LocationId))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> jdbc.update("""
                insert into session_type_location_prices(
                    created_at, updated_at, company_id, session_type_id,
                    transaction_service_id, location_id, price
                ) values (current_timestamp, current_timestamp, ?, ?, ?, ?, 30.0000)
                """, companyId, typeId, transactionServiceId, company2LocationId))
                .isInstanceOf(DataIntegrityViolationException.class);

        Long unlinkedTransactionServiceId = insertTransactionService(jdbc, companyId, "BILL-B");
        assertThatThrownBy(() -> jdbc.update("""
                insert into session_type_location_prices(
                    created_at, updated_at, company_id, session_type_id,
                    transaction_service_id, location_id, price
                ) values (current_timestamp, current_timestamp, ?, ?, ?, ?, 25.0000)
                """, companyId, typeId, unlinkedTransactionServiceId, locationId))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void migrate(String target) {
        FluentConfiguration configuration = Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0");
        if (target != null) configuration.target(target);
        configuration.load().migrate();
    }

    private JdbcTemplate jdbc() {
        DriverManagerDataSource ds = new DriverManagerDataSource();
        ds.setDriverClassName("org.postgresql.Driver");
        ds.setUrl(POSTGRES.getJdbcUrl());
        ds.setUsername(POSTGRES.getUsername());
        ds.setPassword(POSTGRES.getPassword());
        return new JdbcTemplate(ds);
    }

    private Long insertCompany(JdbcTemplate jdbc, Long workspaceId, String name, String code) {
        return jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, ?, ?)
                returning id
                """, Long.class, workspaceId, name, code);
    }

    private Long defaultLocation(JdbcTemplate jdbc, Long companyId) {
        return jdbc.queryForObject(
                "select id from locations where company_id=? and default_location=true",
                Long.class,
                companyId
        );
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

    private Long insertTransactionService(JdbcTemplate jdbc, Long companyId, String code) {
        return jdbc.queryForObject("""
                insert into transaction_service(
                    created_at, updated_at, company_id, code, description, tax_rate, net_price, active
                ) values (current_timestamp, current_timestamp, ?, ?, ?, 'VAT_22', 40.0000, true)
                returning id
                """, Long.class, companyId, code, code);
    }

    private void link(JdbcTemplate jdbc, Long typeId, Long transactionServiceId, BigDecimal price) {
        jdbc.update("""
                insert into type_transaction_services(
                    created_at, updated_at, session_type_id, transaction_service_id, price
                ) values (current_timestamp, current_timestamp, ?, ?, ?)
                """, typeId, transactionServiceId, price);
    }

    private boolean tableExists(JdbcTemplate jdbc, String table) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
                "select to_regclass('public.' || ?) is not null", Boolean.class, table));
    }
}
