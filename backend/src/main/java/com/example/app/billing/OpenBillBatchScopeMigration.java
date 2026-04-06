package com.example.app.billing;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class OpenBillBatchScopeMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public OpenBillBatchScopeMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS batch_scope VARCHAR(16)");
            jdbc.execute("UPDATE open_bills SET batch_scope = 'NONE' WHERE batch_scope IS NULL OR btrim(batch_scope) = ''");
            jdbc.execute("ALTER TABLE open_bills ALTER COLUMN batch_scope SET DEFAULT 'NONE'");
            jdbc.execute("ALTER TABLE open_bills ALTER COLUMN batch_scope SET NOT NULL");
        } catch (Exception ignored) {
            // Best-effort migration for existing installations.
        }
        try {
            jdbc.execute("ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS batch_target_client_id BIGINT");
            jdbc.execute("ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS batch_target_company_id BIGINT");
        } catch (Exception ignored) {
            // Best-effort migration for existing installations.
        }
        try {
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_open_bills_batch_client ON open_bills(batch_target_client_id)");
            jdbc.execute("CREATE INDEX IF NOT EXISTS idx_open_bills_batch_company ON open_bills(batch_target_company_id)");
        } catch (Exception ignored) {
            // Best-effort index creation.
        }
    }
}
