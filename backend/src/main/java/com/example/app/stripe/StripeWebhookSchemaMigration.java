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
public class StripeWebhookSchemaMigration implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(StripeWebhookSchemaMigration.class);

    private final JdbcTemplate jdbc;

    public StripeWebhookSchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("""
                    CREATE TABLE IF NOT EXISTS stripe_webhook_events (
                        id BIGSERIAL PRIMARY KEY,
                        created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
                        event_id VARCHAR(255) NOT NULL UNIQUE,
                        event_type VARCHAR(255) NOT NULL,
                        processing_status VARCHAR(32) NOT NULL,
                        payload TEXT,
                        error_message TEXT
                    )
                    """);
        } catch (Exception ex) {
            log.warn("Stripe webhook schema migration skipped: {}", ex.getMessage());
        }
    }
}
