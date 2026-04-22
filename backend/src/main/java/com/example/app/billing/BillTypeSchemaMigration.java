package com.example.app.billing;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class BillTypeSchemaMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public BillTypeSchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try { jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS bill_type VARCHAR(16)"); } catch (Exception ignored) {}
        try { jdbc.execute("UPDATE bills SET bill_type = 'INVOICE' WHERE bill_type IS NULL OR bill_type = ''"); } catch (Exception ignored) {}
        try { jdbc.execute("CREATE INDEX IF NOT EXISTS idx_bills_company_session_type ON bills(company_id, source_session_id_snapshot, bill_type)"); } catch (Exception ignored) {}
    }
}
