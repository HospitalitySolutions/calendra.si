package com.example.app.settings;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Allows large JSON settings payloads (e.g. folio template layouts).
 */
@Component
public class AppSettingsValueTextMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public AppSettingsValueTextMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE app_settings ALTER COLUMN value TYPE TEXT");
        } catch (Exception ignored) {
            // Already TEXT / unsupported dialect / table missing
        }
    }
}

