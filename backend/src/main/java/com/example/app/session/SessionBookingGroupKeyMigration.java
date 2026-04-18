package com.example.app.session;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Backfills a stable group key for legacy single-client bookings so grouped sessions
 * can be modeled as multiple rows that share the same booking_group_key.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class SessionBookingGroupKeyMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    @Override
    public void run(org.springframework.boot.ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS booking_group_key VARCHAR(64)");
            jdbc.execute(
                    "UPDATE session_booking " +
                    "SET booking_group_key = CONCAT('legacy-', id) " +
                    "WHERE booking_group_key IS NULL OR booking_group_key = ''"
            );
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_session_booking_group_key ON session_booking(booking_group_key)");
        } catch (Exception ex) {
            log.warn("Session booking group key migration skipped: {}", ex.getMessage());
        }
    }
}
