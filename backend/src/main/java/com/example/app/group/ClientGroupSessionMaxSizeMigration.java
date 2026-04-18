package com.example.app.group;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ClientGroupSessionMaxSizeMigration implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public ClientGroupSessionMaxSizeMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute(
                    "ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS session_max_size_enabled BOOLEAN NOT NULL DEFAULT false");
        } catch (Exception ignored) {
        }
        try {
            jdbc.execute("ALTER TABLE client_groups ADD COLUMN IF NOT EXISTS session_max_size INTEGER");
        } catch (Exception ignored) {
        }
    }
}
