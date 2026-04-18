package com.example.app.company;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ClientCompanyActiveMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public ClientCompanyActiveMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE client_companies ADD COLUMN IF NOT EXISTS active BOOLEAN");
        } catch (Exception ignored) {
            // Not PostgreSQL or table missing
        }
        try {
            jdbc.execute("UPDATE client_companies SET active = TRUE WHERE active IS NULL");
        } catch (Exception ignored) {
            // Ignore best-effort backfill
        }
        try {
            jdbc.execute("ALTER TABLE client_companies ALTER COLUMN active SET DEFAULT TRUE");
        } catch (Exception ignored) {
            // Ignore unsupported databases
        }
        try {
            jdbc.execute("ALTER TABLE client_companies ALTER COLUMN active SET NOT NULL");
        } catch (Exception ignored) {
            // Ignore unsupported databases
        }
    }
}
