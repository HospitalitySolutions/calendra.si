package com.example.app.session;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Allows {@code client_id} to be null for group sessions with no participants yet
 * (clients added later on the booking).
 */
@Component
public class SessionBookingClientNullableMigration implements ApplicationRunner {

    private static final String[] TABLE_CANDIDATES = {"session_booking", "session_bookings"};

    private final JdbcTemplate jdbc;

    public SessionBookingClientNullableMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        for (String table : TABLE_CANDIDATES) {
            try {
                jdbc.execute("ALTER TABLE " + table + " ALTER COLUMN client_id DROP NOT NULL");
                return;
            } catch (Exception ignored) {
                // Wrong table name or already nullable / not PostgreSQL
            }
        }
    }
}
