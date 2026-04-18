package com.example.app.billing;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Ensures {@code bills.client_id} is nullable for company-recipient invoices without a linked person client.
 * Hibernate {@code ddl-auto: update} may not alter existing NOT NULL constraints reliably.
 */
@Component
public class BillClientNullableMigration implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public BillClientNullableMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE bills ALTER COLUMN client_id DROP NOT NULL");
        } catch (Exception ignored) {
            // Already nullable / table not present yet / dialect doesn't support this syntax.
        }
    }
}
