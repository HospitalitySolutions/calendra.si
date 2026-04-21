package com.example.app.files;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ClientFilePendingInboxAttachmentMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public ClientFilePendingInboxAttachmentMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbc.execute("ALTER TABLE IF EXISTS client_files ADD COLUMN IF NOT EXISTS pending_inbox_attachment BOOLEAN NOT NULL DEFAULT FALSE");
    }
}
