package com.example.app.stripe;

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
public class StripeBillSchemaMigration implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(StripeBillSchemaMigration.class);

    private final JdbcTemplate jdbc;

    public StripeBillSchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(255)");
            jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS stripe_invoice_id VARCHAR(255)");
            jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS stripe_hosted_invoice_url VARCHAR(2048)");
        } catch (Exception ex) {
            log.warn("Stripe bill schema migration skipped: {}", ex.getMessage());
        }
    }
}
