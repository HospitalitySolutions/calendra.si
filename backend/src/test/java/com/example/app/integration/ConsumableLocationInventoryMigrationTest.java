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
class ConsumableLocationInventoryMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_inventory_location")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void companyWideInventoryIsPreservedOnDefaultBranchAndFutureWritesAreLocationOwned() {
        migrate("50");
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Inventory migration', true)
                returning id
                """, Long.class);
        Long companyId = insertCompany(jdbc, workspaceId, "Inventory company", "inventory-company");
        Long defaultLocationId = defaultLocation(jdbc, companyId);
        Long secondLocationId = insertLocation(jdbc, companyId, "Second branch", false);

        Long consumableId = jdbc.queryForObject("""
                insert into consumable(
                    created_at, updated_at, company_id, name, sku, unit, location,
                    current_stock, minimum_stock, cost_price, track_stock, billable, active
                ) values (
                    current_timestamp, current_timestamp, ?, 'Gloves', 'GLOVES-1', 'box', 'Old free text',
                    12.5000, 3.0000, 4.2500, true, false, true
                ) returning id
                """, Long.class, companyId);
        Long movementId = jdbc.queryForObject("""
                insert into consumable_stock_movement(
                    created_at, updated_at, company_id, consumable_id, movement_type, source_type,
                    quantity_delta, stock_before, stock_after, unit_cost_snapshot, value_delta, note
                ) values (
                    current_timestamp, current_timestamp, ?, ?, 'CORRECTION', 'MANUAL',
                    2.0000, 10.5000, 12.5000, 4.2500, 8.5000, 'Legacy movement'
                ) returning id
                """, Long.class, companyId, consumableId);
        Long purchaseOrderId = jdbc.queryForObject("""
                insert into consumable_purchase_order(
                    created_at, updated_at, company_id, order_number, status, order_date,
                    total_amount, received_amount, notes
                ) values (
                    current_timestamp, current_timestamp, ?, 'PO-LEGACY-1', 'DRAFT', current_date,
                    42.00, 0, 'Legacy order'
                ) returning id
                """, Long.class, companyId);

        migrate(null);

        assertThat(tableExists(jdbc, "consumable_location_stock")).isTrue();
        assertThat(columnExists(jdbc, "consumable", "location")).isFalse();
        assertThat(columnExists(jdbc, "consumable", "current_stock")).isFalse();
        assertThat(columnExists(jdbc, "consumable", "minimum_stock")).isFalse();
        assertThat(columnExists(jdbc, "consumable", "cost_price")).isFalse();
        assertThat(columnNullable(jdbc, "consumable_stock_movement", "location_id")).isEqualTo("NO");
        assertThat(columnNullable(jdbc, "consumable_purchase_order", "location_id")).isEqualTo("NO");

        assertThat(jdbc.queryForObject("""
                select current_stock from consumable_location_stock
                where consumable_id=? and location_id=?
                """, BigDecimal.class, consumableId, defaultLocationId)).isEqualByComparingTo("12.5000");
        assertThat(jdbc.queryForObject("""
                select current_stock from consumable_location_stock
                where consumable_id=? and location_id=?
                """, BigDecimal.class, consumableId, secondLocationId)).isEqualByComparingTo("0.0000");
        assertThat(jdbc.queryForObject("""
                select minimum_stock from consumable_location_stock
                where consumable_id=? and location_id=?
                """, BigDecimal.class, consumableId, secondLocationId)).isEqualByComparingTo("3.0000");
        assertThat(jdbc.queryForObject("""
                select cost_price from consumable_location_stock
                where consumable_id=? and location_id=?
                """, BigDecimal.class, consumableId, secondLocationId)).isEqualByComparingTo("4.2500");
        assertThat(jdbc.queryForObject("select location_id from consumable_stock_movement where id=?", Long.class, movementId))
                .isEqualTo(defaultLocationId);
        assertThat(jdbc.queryForObject("select location_id from consumable_purchase_order where id=?", Long.class, purchaseOrderId))
                .isEqualTo(defaultLocationId);

        Long bookingId = insertBooking(jdbc, companyId, defaultLocationId);
        Long sessionConsumableId = jdbc.queryForObject("""
                insert into session_consumable(
                    created_at, updated_at, company_id, session_booking_id, booking_group_key,
                    consumable_id, quantity, unit, quantity_mode, cost_price_snapshot, billable, source, manually_changed
                ) values (
                    current_timestamp, current_timestamp, ?, ?, 'inventory-session',
                    ?, 1, 'box', 'PER_SESSION', 4.25, false, 'MANUAL', true
                ) returning id
                """, Long.class, companyId, bookingId, consumableId);
        assertThatThrownBy(() -> insertSessionMovement(jdbc, companyId, consumableId, secondLocationId,
                sessionConsumableId, "SESSION_USAGE", new BigDecimal("-1")))
                .isInstanceOf(DataIntegrityViolationException.class);
        Long usageMovementId = insertSessionMovement(jdbc, companyId, consumableId, defaultLocationId,
                sessionConsumableId, "SESSION_USAGE", new BigDecimal("-1"));
        assertThat(usageMovementId).isPositive();
        assertThatThrownBy(() -> insertSessionMovement(jdbc, companyId, consumableId, secondLocationId,
                sessionConsumableId, "RETURN", BigDecimal.ONE))
                .isInstanceOf(DataIntegrityViolationException.class);
        Long returnMovementId = insertSessionMovement(jdbc, companyId, consumableId, defaultLocationId,
                sessionConsumableId, "RETURN", BigDecimal.ONE);
        assertThat(returnMovementId).isPositive();

        Long company2Id = insertCompany(jdbc, workspaceId, "Other company", "inventory-company-2");
        Long company2LocationId = defaultLocation(jdbc, company2Id);
        assertThatThrownBy(() -> jdbc.update("""
                insert into consumable_location_stock(
                    created_at, updated_at, company_id, consumable_id, location_id,
                    current_stock, minimum_stock, cost_price
                ) values (current_timestamp, current_timestamp, ?, ?, ?, 1, 0, 1)
                """, companyId, consumableId, company2LocationId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into consumable_stock_movement(
                    created_at, updated_at, company_id, consumable_id, location_id,
                    movement_type, source_type, quantity_delta, stock_before, stock_after, unit_cost_snapshot
                ) values (current_timestamp, current_timestamp, ?, ?, ?, 'CORRECTION', 'MANUAL', 1, 0, 1, 1)
                """, companyId, consumableId, company2LocationId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("""
                insert into consumable_purchase_order(
                    created_at, updated_at, company_id, location_id, order_number, status,
                    order_date, total_amount, received_amount
                ) values (current_timestamp, current_timestamp, ?, ?, 'PO-CROSS', 'DRAFT', current_date, 0, 0)
                """, companyId, company2LocationId))
                .isInstanceOf(DataIntegrityViolationException.class);

        Long thirdLocationId = insertLocation(jdbc, companyId, "Third branch", false);
        assertThat(jdbc.queryForObject("""
                select count(*) from consumable_location_stock where consumable_id=? and location_id=?
                """, Integer.class, consumableId, thirdLocationId)).isEqualTo(1);

        Long laterConsumableId = jdbc.queryForObject("""
                insert into consumable(
                    created_at, updated_at, company_id, name, sku, unit,
                    sale_price, track_stock, billable, active
                ) values (current_timestamp, current_timestamp, ?, 'Masks', 'MASK-1', 'box', null, true, false, true)
                returning id
                """, Long.class, companyId);
        assertThat(jdbc.queryForObject("""
                select count(*) from consumable_location_stock where consumable_id=? and company_id=?
                """, Integer.class, laterConsumableId, companyId)).isEqualTo(3);
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

    private Long insertLocation(JdbcTemplate jdbc, Long companyId, String name, boolean defaultLocation) {
        return jdbc.queryForObject("""
                insert into locations(
                    created_at, updated_at, company_id, name, timezone,
                    public_booking_enabled, default_location, active
                ) values (current_timestamp, current_timestamp, ?, ?, 'Europe/Ljubljana', true, ?, true)
                returning id
                """, Long.class, companyId, name, defaultLocation);
    }

    private Long insertBooking(JdbcTemplate jdbc, Long companyId, Long locationId) {
        return jdbc.queryForObject("""
                insert into session_booking(
                    created_at, updated_at, company_id, location_id, start_time, end_time, availability_end_time,
                    payee_custom_data, booking_source, meeting_provisioning_status,
                    meeting_provisioning_attempts, meeting_confirmation_pending, service_group_snapshot_captured
                ) values (
                    current_timestamp, current_timestamp, ?, ?, current_timestamp + interval '1 day',
                    current_timestamp + interval '1 day 30 minutes', current_timestamp + interval '1 day 30 minutes',
                    false, 'MANUAL', 'NONE', 0, false, true
                ) returning id
                """, Long.class, companyId, locationId);
    }

    private Long insertSessionMovement(
            JdbcTemplate jdbc,
            Long companyId,
            Long consumableId,
            Long locationId,
            Long sourceId,
            String movementType,
            BigDecimal delta
    ) {
        BigDecimal after = new BigDecimal("12.5000").add(delta);
        return jdbc.queryForObject("""
                insert into consumable_stock_movement(
                    created_at, updated_at, company_id, consumable_id, location_id,
                    movement_type, source_type, source_id, quantity_delta, stock_before, stock_after, unit_cost_snapshot
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?, ?, 'SESSION', ?, ?, 12.5000, ?, 4.2500
                ) returning id
                """, Long.class, companyId, consumableId, locationId, movementType, sourceId, delta, after);
    }

    private boolean tableExists(JdbcTemplate jdbc, String table) {
        return Boolean.TRUE.equals(jdbc.queryForObject("select to_regclass('public.' || ?) is not null", Boolean.class, table));
    }

    private boolean columnExists(JdbcTemplate jdbc, String table, String column) {
        Integer count = jdbc.queryForObject("""
                select count(*) from information_schema.columns
                where table_schema='public' and table_name=? and column_name=?
                """, Integer.class, table, column);
        return count != null && count > 0;
    }

    private String columnNullable(JdbcTemplate jdbc, String table, String column) {
        return jdbc.queryForObject("""
                select is_nullable from information_schema.columns
                where table_schema='public' and table_name=? and column_name=?
                """, String.class, table, column);
    }
}
