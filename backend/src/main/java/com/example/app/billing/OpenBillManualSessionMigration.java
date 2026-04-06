package com.example.app.billing;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class OpenBillManualSessionMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public OpenBillManualSessionMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS manual_session_numbers_csv TEXT");
            jdbc.execute("ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS manual_session_number_max BIGINT");
        } catch (Exception ignored) {
            // Best-effort migration for existing installations.
        }
    }
}
