package com.example.app.inbox;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ClientMessageAttachmentSchemaMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public ClientMessageAttachmentSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS client_message_attachments (
                    id BIGSERIAL PRIMARY KEY,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    message_id BIGINT NOT NULL REFERENCES client_messages(id) ON DELETE CASCADE,
                    client_file_id BIGINT NOT NULL REFERENCES client_files(id) ON DELETE CASCADE,
                    CONSTRAINT uq_client_message_attachment UNIQUE (message_id, client_file_id)
                )
                """);
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_client_message_attachments_message ON client_message_attachments (message_id)");
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_client_message_attachments_file ON client_message_attachments (client_file_id)");
    }
}
