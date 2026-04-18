package com.example.app.session;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Session-level overrides for group email / billing company (calendar edit only; does not change {@code client_groups}).
 */
@Component
public class SessionBookingGroupSessionOverridesMigration implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public SessionBookingGroupSessionOverridesMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute(
                    "ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS session_group_email_override VARCHAR(512)");
        } catch (Exception ignored) {
            // non-PostgreSQL or table name differs
        }
        try {
            jdbc.execute(
                    "ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS session_group_billing_company_id BIGINT REFERENCES client_companies(id)");
        } catch (Exception ignored) {
            // FK may not apply on some DBs
        }
    }
}
