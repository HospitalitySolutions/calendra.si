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
public class BankTransferReferenceSchemaMigration implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(BankTransferReferenceSchemaMigration.class);

    private final JdbcTemplate jdbc;

    public BankTransferReferenceSchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE bills ADD COLUMN IF NOT EXISTS bank_transfer_reference VARCHAR(255)");
        } catch (Exception ex) {
            log.warn("Bank transfer reference schema migration skipped: {}", ex.getMessage());
        }
    }
}
