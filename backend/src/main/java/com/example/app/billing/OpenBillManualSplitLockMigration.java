package com.example.app.billing;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class OpenBillManualSplitLockMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public OpenBillManualSplitLockMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS manual_split_locked BOOLEAN");
            jdbc.execute("UPDATE open_bills SET manual_split_locked = FALSE WHERE manual_split_locked IS NULL");
            jdbc.execute("ALTER TABLE open_bills ALTER COLUMN manual_split_locked SET DEFAULT FALSE");
            jdbc.execute("ALTER TABLE open_bills ALTER COLUMN manual_split_locked SET NOT NULL");
        } catch (Exception ignored) {
            // Best-effort migration for existing installations.
        }
    }
}
