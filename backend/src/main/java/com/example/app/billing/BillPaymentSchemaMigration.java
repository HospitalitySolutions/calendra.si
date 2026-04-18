package com.example.app.billing;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class BillPaymentSchemaMigration implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(BillPaymentSchemaMigration.class);

    private final JdbcTemplate jdbc;

    public BillPaymentSchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_status VARCHAR(32)");
            jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS checkout_session_id VARCHAR(255)");
            jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS checkout_session_expires_at TIMESTAMP WITH TIME ZONE");
            jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS payment_intent_id VARCHAR(255)");
            jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS paid_at TIMESTAMP WITH TIME ZONE");
            jdbc.execute("UPDATE bills SET payment_status = 'paid' WHERE payment_status IS NULL OR btrim(payment_status) = ''");
            jdbc.execute("ALTER TABLE bills ALTER COLUMN payment_status SET NOT NULL");
            jdbc.execute("ALTER TABLE bills DROP CONSTRAINT IF EXISTS bills_payment_status_check");
            jdbc.execute(
                    "ALTER TABLE bills ADD CONSTRAINT bills_payment_status_check CHECK (payment_status IN ('open','payment_pending','paid','cancelled'))"
            );
        } catch (Exception ex) {
            log.warn("Bill payment schema migration skipped: {}", ex.getMessage());
        }
    }
}
