package com.example.app.company;

import javax.sql.DataSource;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import jakarta.annotation.PostConstruct;

@Component
public class CompanyPayPalSchemaMigration {
    private static final Logger log = LoggerFactory.getLogger(CompanyPayPalSchemaMigration.class);
    private final JdbcTemplate jdbc;

    public CompanyPayPalSchemaMigration(DataSource dataSource) {
        this.jdbc = new JdbcTemplate(dataSource);
    }

    @PostConstruct
    public void migrate() {
        try {
            jdbc.execute("ALTER TABLE company ADD COLUMN IF NOT EXISTS paypal_merchant_id VARCHAR(255)");
            jdbc.execute("ALTER TABLE company ADD COLUMN IF NOT EXISTS paypal_tracking_id VARCHAR(255)");
            jdbc.execute("ALTER TABLE company ADD COLUMN IF NOT EXISTS paypal_onboarding_status VARCHAR(64)");
            jdbc.execute("ALTER TABLE company ADD COLUMN IF NOT EXISTS paypal_payments_receivable BOOLEAN");
            jdbc.execute("ALTER TABLE company ADD COLUMN IF NOT EXISTS paypal_primary_email_confirmed BOOLEAN");
        } catch (Exception ex) {
            log.warn("Company PayPal schema migration skipped/failed: {}", ex.getMessage());
        }
    }
}
