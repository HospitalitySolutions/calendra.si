package com.example.app.session;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ensures {@code consultant_id} is nullable so unassigned bookings can be saved.
 * Hibernate {@code ddl-auto: update} does not always alter NOT NULL to nullable on existing columns.
 */
@Component
public class SessionBookingConsultantNullableMigration implements ApplicationRunner {

    private static final String[] TABLE_CANDIDATES = { "session_booking", "session_bookings" };

    private final JdbcTemplate jdbc;

    public SessionBookingConsultantNullableMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (String table : TABLE_CANDIDATES) {
            try {
                jdbc.execute("ALTER TABLE " + table + " ALTER COLUMN consultant_id DROP NOT NULL");
                return;
            } catch (Exception ignored) {
                // Wrong table name or already nullable / not PostgreSQL
            }
        }
    }
}
