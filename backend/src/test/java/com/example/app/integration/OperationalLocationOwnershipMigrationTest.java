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
class OperationalLocationOwnershipMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_location_ownership")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void operationalRowsCarryLocationAndRejectCrossLocationWrites() {
        Flyway.configure()
                .dataSource(POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword())
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .load()
                .migrate();
        JdbcTemplate jdbc = jdbc();

        assertNotNullable(jdbc, "open_bills", "location_id");
        assertNotNullable(jdbc, "waitlist_requests", "location_id");
        assertNotNullable(jdbc, "waitlist_offers", "location_id");
        assertNotNullable(jdbc, "waitlist_booking_holds", "location_id");
        assertNotNullable(jdbc, "booking_slot_holds", "location_id");
        // Product-only wallet purchases are scoped in Phase 5.5C; booking orders are populated now.
        assertThat(columnNullable(jdbc, "guest_orders", "location_id")).isEqualTo("YES");
        assertNotNullable(jdbc, "bookable_slot", "location_id");
        assertNotNullable(jdbc, "users", "available_all_locations");
        assertThat(columnNullable(jdbc, "users", "working_hours_by_location_json")).isEqualTo("YES");
        assertThat(jdbc.queryForObject("select to_regclass('public.user_locations') is not null", Boolean.class)).isTrue();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Location ownership', true)
                returning id
                """, Long.class);
        Long firstCompanyId = insertCompany(jdbc, workspaceId, "First company", "loc-own-first");
        Long secondCompanyId = insertCompany(jdbc, workspaceId, "Second company", "loc-own-second");
        Long firstLocationId = defaultLocation(jdbc, firstCompanyId);
        Long secondLocationId = defaultLocation(jdbc, secondCompanyId);
        Long firstCompanySecondLocationId = jdbc.queryForObject("""
                insert into locations(
                    created_at, updated_at, company_id, name, timezone,
                    public_booking_enabled, default_location, active
                ) values (current_timestamp, current_timestamp, ?, 'Second branch',
                    'Europe/Ljubljana', true, false, true)
                returning id
                """, Long.class, firstCompanyId);
        assertThat(firstCompanySecondLocationId).isPositive();
        assertThatThrownBy(() -> jdbc.update("""
                insert into space(created_at, updated_at, company_id, name)
                values (current_timestamp, current_timestamp, ?, 'Ambiguous raw room')
                """, firstCompanyId))
                .isInstanceOf(DataIntegrityViolationException.class);
        Long serviceId = insertService(jdbc, firstCompanyId);
        Long requestId = insertWaitlistRequest(jdbc, firstCompanyId, firstLocationId, serviceId);
        Long offerId = insertWaitlistOffer(jdbc, firstCompanyId, firstLocationId, requestId, serviceId);

        assertThatThrownBy(() -> jdbc.update(
                "update waitlist_offers set location_id=? where id=?", secondLocationId, offerId))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> jdbc.update("""
                insert into waitlist_booking_holds(
                    created_at, updated_at, company_id, offer_id, location_id,
                    slot_start, slot_end, status, expires_at, version
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?,
                    current_timestamp + interval '1 day', current_timestamp + interval '1 day 30 minutes',
                    'ACTIVE', current_timestamp + interval '15 minutes', 0
                )
                """, firstCompanyId, offerId, secondLocationId))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> jdbc.update("""
                insert into booking_slot_holds(
                    created_at, updated_at, company_id, location_id,
                    slot_start, slot_end, busy_end, slot_id, hold_token, expires_at
                ) values (
                    current_timestamp, current_timestamp, ?, ?,
                    current_timestamp + interval '1 day', current_timestamp + interval '1 day 30 minutes',
                    current_timestamp + interval '1 day 30 minutes', 'slot', 'cross-location-hold',
                    current_timestamp + interval '15 minutes'
                )
                """, firstCompanyId, secondLocationId))
                .isInstanceOf(DataIntegrityViolationException.class);

        Long consultantId = insertConsultant(jdbc, firstCompanyId, "location-consultant@example.test");
        jdbc.update("update users set available_all_locations=false where id=?", consultantId);
        jdbc.update("insert into user_locations(user_id, location_id) values (?, ?)", consultantId, firstLocationId);

        assertThatThrownBy(() -> jdbc.update(
                "insert into user_locations(user_id, location_id) values (?, ?)", consultantId, secondLocationId))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> insertBookableSlot(jdbc, firstCompanyId, firstCompanySecondLocationId, consultantId))
                .isInstanceOf(DataIntegrityViolationException.class);

        jdbc.update("insert into user_locations(user_id, location_id) values (?, ?)", consultantId, firstCompanySecondLocationId);
        Long bookableSlotId = insertBookableSlot(jdbc, firstCompanyId, firstCompanySecondLocationId, consultantId);
        assertThat(bookableSlotId).isPositive();
    }

    private void assertNotNullable(JdbcTemplate jdbc, String table, String column) {
        assertThat(columnNullable(jdbc, table, column)).isEqualTo("NO");
    }

    private String columnNullable(JdbcTemplate jdbc, String table, String column) {
        return jdbc.queryForObject("""
                select is_nullable
                  from information_schema.columns
                 where table_schema='public' and table_name=? and column_name=?
                """, String.class, table, column);
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

    private Long insertService(JdbcTemplate jdbc, Long companyId) {
        return jdbc.queryForObject("""
                insert into session_type(
                    created_at, updated_at, company_id, name, duration_minutes, break_minutes,
                    widget_group_booking_enabled, guest_booking_enabled, group_booking_enabled,
                    price_calculation_mode, guest_sort_order, active, available_all_locations
                ) values (
                    current_timestamp, current_timestamp, ?, 'Location service', 30, 0,
                    false, true, false, 'PER_CLIENT', 0, true, true
                ) returning id
                """, Long.class, companyId);
    }

    private Long insertWaitlistRequest(JdbcTemplate jdbc, Long companyId, Long locationId, Long serviceId) {
        return jdbc.queryForObject("""
                insert into waitlist_requests(
                    created_at, updated_at, company_id, service_id, location_id,
                    target_type, date_from, date_to, employee_preference_type,
                    requested_participants, status, source, joined_at, duplicate_key, version,
                    service_scope, service_chain
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?, 'INDIVIDUAL', current_date,
                    current_date + 7, 'ANY', 1, 'ACTIVE', 'STAFF', current_timestamp,
                    'location-ownership-request', 0, 'EXACT_SERVICE', false
                ) returning id
                """, Long.class, companyId, serviceId, locationId);
    }

    private Long insertWaitlistOffer(
            JdbcTemplate jdbc,
            Long companyId,
            Long locationId,
            Long requestId,
            Long serviceId
    ) {
        return jdbc.queryForObject("""
                insert into waitlist_offers(
                    created_at, updated_at, company_id, waitlist_request_id, location_id,
                    service_id, service_name_snapshot, slot_start, slot_end, available_slot_end,
                    status, offered_at, expires_at, secure_token_hash, version
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?, ?, 'Location service',
                    current_timestamp + interval '1 day', current_timestamp + interval '1 day 30 minutes',
                    current_timestamp + interval '1 day 30 minutes', 'PENDING', current_timestamp,
                    current_timestamp + interval '15 minutes', 'location-ownership-token', 0
                ) returning id
                """, Long.class, companyId, requestId, locationId, serviceId);
    }

    private Long insertConsultant(JdbcTemplate jdbc, Long companyId, String email) {
        Long loginAccountId = jdbc.queryForObject("""
                insert into login_accounts(
                    created_at, updated_at, first_name, last_name, email, password_hash, active, last_selected_company_id
                ) values (
                    current_timestamp, current_timestamp, 'Location', 'Consultant', ?, '$2a$10$testHash', true, ?
                ) returning id
                """, Long.class, email, companyId);
        return jdbc.queryForObject("""
                insert into users(
                    created_at, updated_at, company_id, login_account_id, first_name, last_name, email, password_hash,
                    role, active, consultant, available_all_locations
                ) values (
                    current_timestamp, current_timestamp, ?, ?, 'Location', 'Consultant', ?, '$2a$10$testHash',
                    'CONSULTANT', true, true, true
                ) returning id
                """, Long.class, companyId, loginAccountId, email);
    }

    private Long insertBookableSlot(JdbcTemplate jdbc, Long companyId, Long locationId, Long consultantId) {
        return jdbc.queryForObject("""
                insert into bookable_slot(
                    created_at, updated_at, company_id, location_id, day_of_week, start_time, end_time,
                    consultant_id, indefinite
                ) values (
                    current_timestamp, current_timestamp, ?, ?, 'MONDAY', '09:00', '10:00', ?, true
                ) returning id
                """, Long.class, companyId, locationId, consultantId);
    }

    private JdbcTemplate jdbc() {
        return new JdbcTemplate(new DriverManagerDataSource(
                POSTGRES.getJdbcUrl(), POSTGRES.getUsername(), POSTGRES.getPassword()));
    }
}
