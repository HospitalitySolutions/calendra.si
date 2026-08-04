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
class LocationSchedulingMigrationTest {
    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:16-alpine")
            .withDatabaseName("calendra_locations")
            .withUsername("calendra")
            .withPassword("calendra");

    @Test
    void backfillsDefaultLocationsAndEnforcesBookingRoomOwnership() {
        flyway("25").migrate();
        JdbcTemplate jdbc = jdbc();

        Long workspaceId = jdbc.queryForObject("""
                insert into workspaces(created_at, updated_at, name, active)
                values (current_timestamp, current_timestamp, 'Scheduling workspace', true)
                returning id
                """, Long.class);
        Long firstCompanyId = insertCompany(jdbc, workspaceId, "Maribor", "phase3-maribor");
        Long secondCompanyId = insertCompany(jdbc, workspaceId, "Ljubljana", "phase3-ljubljana");
        Long firstSpaceId = insertSpace(jdbc, firstCompanyId, "Room 1");
        Long secondSpaceId = insertSpace(jdbc, secondCompanyId, "Room 2");
        Long bookingId = insertBooking(jdbc, firstCompanyId, firstSpaceId);
        Long clientId = insertClient(jdbc, firstCompanyId);
        Long serviceId = insertService(jdbc, firstCompanyId);
        Long waitlistId = jdbc.queryForObject("""
                insert into waitlist_requests(
                    created_at, updated_at, company_id, client_id, service_id, location_id,
                    target_type, date_from, date_to, employee_preference_type,
                    requested_participants, status, source, joined_at, duplicate_key, version,
                    service_scope
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?, ?, 'INDIVIDUAL', current_date,
                    current_date + 7, 'ANY', 1, 'ACTIVE', 'STAFF', current_timestamp,
                    'phase3-location-migration', 0, 'EXACT_SERVICE'
                ) returning id
                """, Long.class, firstCompanyId, clientId, serviceId, firstSpaceId);

        flyway(null).migrate();

        Long firstDefaultLocationId = jdbc.queryForObject(
                "select id from locations where company_id=? and default_location=true", Long.class, firstCompanyId);
        Long secondDefaultLocationId = jdbc.queryForObject(
                "select id from locations where company_id=? and default_location=true", Long.class, secondCompanyId);
        assertThat(jdbc.queryForObject("select location_id from space where id=?", Long.class, firstSpaceId))
                .isEqualTo(firstDefaultLocationId);
        assertThat(jdbc.queryForObject("select location_id from session_booking where id=?", Long.class, bookingId))
                .isEqualTo(firstDefaultLocationId);
        assertThat(jdbc.queryForObject("select location_id from waitlist_requests where id=?", Long.class, waitlistId))
                .isEqualTo(firstDefaultLocationId);

        // Legacy/raw writers may omit location_id; database triggers assign the unit default.
        Long rawSpaceId = jdbc.queryForObject("""
                insert into space(created_at, updated_at, company_id, name)
                values (current_timestamp, current_timestamp, ?, 'Raw room') returning id
                """, Long.class, firstCompanyId);
        assertThat(jdbc.queryForObject("select location_id from space where id=?", Long.class, rawSpaceId))
                .isEqualTo(firstDefaultLocationId);
        Long rawBookingId = insertBooking(jdbc, firstCompanyId, null);
        assertThat(jdbc.queryForObject("select location_id from session_booking where id=?", Long.class, rawBookingId))
                .isEqualTo(firstDefaultLocationId);

        Long secondBranchId = jdbc.queryForObject("""
                insert into locations(
                    created_at, updated_at, company_id, name, timezone,
                    public_booking_enabled, default_location, active
                ) values (current_timestamp, current_timestamp, ?, 'Maribor East', 'Europe/Ljubljana', true, false, true)
                returning id
                """, Long.class, firstCompanyId);
        jdbc.update("update space set location_id=? where id=?", secondBranchId, rawSpaceId);
        Long branchBookingId = insertBooking(jdbc, firstCompanyId, rawSpaceId);
        assertThat(jdbc.queryForObject("select location_id from session_booking where id=?", Long.class, branchBookingId))
                .isEqualTo(secondBranchId);

        assertThatThrownBy(() -> jdbc.update("update space set location_id=? where id=?", secondDefaultLocationId, firstSpaceId))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update(
                "update session_booking set location_id=? where id=?", firstDefaultLocationId, branchBookingId))
                .isInstanceOf(DataIntegrityViolationException.class);

        assertThatThrownBy(() -> jdbc.update("""
                insert into session_service(
                    created_at, updated_at, session_booking_id, session_type_id, space_id, position,
                    start_time, end_time, service_name_snapshot, duration_minutes_snapshot,
                    break_minutes_snapshot, price_calculation_mode_snapshot
                ) values (
                    current_timestamp, current_timestamp, ?, ?, ?, 0,
                    current_timestamp, current_timestamp + interval '30 minutes', 'Service', 30, 0, 'PER_CLIENT'
                )
                """, branchBookingId, serviceId, firstSpaceId))
                .isInstanceOf(DataIntegrityViolationException.class);

        Long newCompanyId = insertCompany(jdbc, workspaceId, "Koper", "phase3-koper");
        assertThat(jdbc.queryForObject(
                "select count(*) from locations where company_id=? and default_location=true", Integer.class, newCompanyId))
                .isEqualTo(1);
        assertThat(secondSpaceId).isPositive();
    }

    private Long insertCompany(JdbcTemplate jdbc, Long workspaceId, String name, String code) {
        return jdbc.queryForObject("""
                insert into company(created_at, updated_at, workspace_id, name, tenant_code)
                values (current_timestamp, current_timestamp, ?, ?, ?)
                returning id
                """, Long.class, workspaceId, name, code);
    }

    private Long insertSpace(JdbcTemplate jdbc, Long companyId, String name) {
        return jdbc.queryForObject("""
                insert into space(created_at, updated_at, company_id, name)
                values (current_timestamp, current_timestamp, ?, ?) returning id
                """, Long.class, companyId, name);
    }

    private Long insertBooking(JdbcTemplate jdbc, Long companyId, Long spaceId) {
        return jdbc.queryForObject("""
                insert into session_booking(
                    created_at, updated_at, company_id, start_time, end_time, availability_end_time,
                    space_id, payee_custom_data, booking_source, meeting_provisioning_status,
                    meeting_provisioning_attempts, meeting_confirmation_pending,
                    service_group_snapshot_captured
                ) values (
                    current_timestamp, current_timestamp, ?, current_timestamp + interval '1 day',
                    current_timestamp + interval '1 day 30 minutes', current_timestamp + interval '1 day 30 minutes',
                    ?, false, 'MANUAL', 'NONE', 0, false, true
                ) returning id
                """, Long.class, companyId, spaceId);
    }

    private Long insertClient(JdbcTemplate jdbc, Long companyId) {
        return jdbc.queryForObject("""
                insert into clients(
                    created_at, updated_at, company_id, first_name, last_name,
                    whatsapp_opt_in, viber_connected, anonymized, active, batch_payment_enabled,
                    inbox_starred, inbox_closed, invoice_recipient_type,
                    suppress_invoice_emails, online_booking_blocked
                ) values (
                    current_timestamp, current_timestamp, ?, 'Migration', 'Client',
                    false, false, false, true, false, false, false, 'PERSON', false, false
                ) returning id
                """, Long.class, companyId);
    }

    private Long insertService(JdbcTemplate jdbc, Long companyId) {
        return jdbc.queryForObject("""
                insert into session_type(
                    created_at, updated_at, company_id, name, duration_minutes, break_minutes,
                    widget_group_booking_enabled, guest_booking_enabled, group_booking_enabled,
                    price_calculation_mode, guest_sort_order, active
                ) values (
                    current_timestamp, current_timestamp, ?, 'Service', 30, 0,
                    false, true, false, 'PER_CLIENT', 0, true
                ) returning id
                """, Long.class, companyId);
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
