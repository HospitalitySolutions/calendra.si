package com.example.app.billing;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class OpenBillItemSourceSessionMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public OpenBillItemSourceSessionMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE open_bill_items ADD COLUMN IF NOT EXISTS source_session_booking_id BIGINT");
        } catch (Exception ignored) {
            // Best-effort migration for existing installations.
        }
        try {
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_open_bill_items_source_session ON open_bill_items(source_session_booking_id)");
        } catch (Exception ignored) {
            // Best-effort index creation.
        }
    }
}
