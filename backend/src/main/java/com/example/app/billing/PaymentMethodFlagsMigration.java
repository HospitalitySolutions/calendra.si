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
public class PaymentMethodFlagsMigration implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(PaymentMethodFlagsMigration.class);

    private final JdbcTemplate jdbc;

    public PaymentMethodFlagsMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS fiscalized BOOLEAN");
            jdbc.execute("ALTER TABLE payment_methods ADD COLUMN IF NOT EXISTS stripe_enabled BOOLEAN");
            jdbc.execute("UPDATE payment_methods SET fiscalized = (payment_type <> 'CARD') WHERE fiscalized IS NULL");
            jdbc.execute("UPDATE payment_methods SET stripe_enabled = (payment_type = 'CARD') WHERE stripe_enabled IS NULL");
            jdbc.execute("ALTER TABLE payment_methods ALTER COLUMN fiscalized SET DEFAULT true");
            jdbc.execute("ALTER TABLE payment_methods ALTER COLUMN stripe_enabled SET DEFAULT false");
            jdbc.execute("ALTER TABLE payment_methods ALTER COLUMN fiscalized SET NOT NULL");
            jdbc.execute("ALTER TABLE payment_methods ALTER COLUMN stripe_enabled SET NOT NULL");
        } catch (Exception ex) {
            log.warn("Payment method flags migration skipped: {}", ex.getMessage());
        }
    }
}
