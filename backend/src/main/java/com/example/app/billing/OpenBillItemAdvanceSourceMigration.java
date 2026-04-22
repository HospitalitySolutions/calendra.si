package com.example.app.billing;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class OpenBillItemAdvanceSourceMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public OpenBillItemAdvanceSourceMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try { jdbc.execute("ALTER TABLE open_bill_items ADD COLUMN IF NOT EXISTS source_advance_bill_id BIGINT"); } catch (Exception ignored) {}
        try { jdbc.execute("CREATE INDEX IF NOT EXISTS idx_open_bill_items_source_advance_bill ON open_bill_items(source_advance_bill_id)"); } catch (Exception ignored) {}
    }
}
