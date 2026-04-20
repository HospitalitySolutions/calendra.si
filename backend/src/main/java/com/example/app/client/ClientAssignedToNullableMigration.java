package com.example.app.client;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * Allows clients without an assigned consultant (tenant-wide pool).
 * Hibernate {@code ddl-auto: update} may not relax NOT NULL on existing FK columns reliably.
 */
@Component
public class ClientAssignedToNullableMigration implements ApplicationRunner {

    private final JdbcTemplate jdbc;

    public ClientAssignedToNullableMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE clients ALTER COLUMN assigned_to_id DROP NOT NULL");
        } catch (Exception ignored) {
            // Already nullable / table not present / dialect doesn't support this syntax.
        }
    }
}
