package com.example.app.billing;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class BatchPaymentSchemaMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public BatchPaymentSchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE clients ADD COLUMN IF NOT EXISTS batch_payment_enabled BOOLEAN");
            jdbc.execute("UPDATE clients SET batch_payment_enabled = FALSE WHERE batch_payment_enabled IS NULL");
            jdbc.execute("ALTER TABLE clients ALTER COLUMN batch_payment_enabled SET DEFAULT FALSE");
            jdbc.execute("ALTER TABLE clients ALTER COLUMN batch_payment_enabled SET NOT NULL");
        } catch (Exception ignored) {
            // Best-effort migration for existing installations.
        }

        try {
            jdbc.execute("ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS batch_payment_enabled BOOLEAN");
            jdbc.execute("UPDATE client_companies SET batch_payment_enabled = FALSE WHERE batch_payment_enabled IS NULL");
            jdbc.execute("ALTER TABLE client_companies ALTER COLUMN batch_payment_enabled SET DEFAULT FALSE");
            jdbc.execute("ALTER TABLE client_companies ALTER COLUMN batch_payment_enabled SET NOT NULL");
        } catch (Exception ignored) {
            // Best-effort migration for existing installations.
        }
    }
}
