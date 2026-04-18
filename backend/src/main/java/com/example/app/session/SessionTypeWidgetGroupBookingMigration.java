package com.example.app.session;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class SessionTypeWidgetGroupBookingMigration implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public SessionTypeWidgetGroupBookingMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute(
                    "ALTER TABLE session_type ADD COLUMN IF NOT EXISTS widget_group_booking_enabled BOOLEAN NOT NULL DEFAULT false");
        } catch (Exception ignored) {
        }
    }
}
