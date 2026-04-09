package com.example.app.files;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class ClientCompanyFileSchemaMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public ClientCompanyFileSchemaMigration(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @Override
    public void run(ApplicationArguments args) {
        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS client_files (
                    id BIGSERIAL PRIMARY KEY,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
                    owner_company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
                    original_file_name VARCHAR(512) NOT NULL,
                    content_type VARCHAR(255),
                    size_bytes BIGINT NOT NULL,
                    s3_object_key VARCHAR(1024) NOT NULL,
                    uploaded_by_user_id BIGINT
                )
                """);
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_client_files_client_company ON client_files (client_id, owner_company_id)");

        jdbc.execute("""
                CREATE TABLE IF NOT EXISTS company_files (
                    id BIGSERIAL PRIMARY KEY,
                    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
                    company_id BIGINT NOT NULL REFERENCES client_companies(id) ON DELETE CASCADE,
                    owner_company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
                    original_file_name VARCHAR(512) NOT NULL,
                    content_type VARCHAR(255),
                    size_bytes BIGINT NOT NULL,
                    s3_object_key VARCHAR(1024) NOT NULL,
                    uploaded_by_user_id BIGINT
                )
                """);
        jdbc.execute("CREATE INDEX IF NOT EXISTS idx_company_files_company_owner ON company_files (company_id, owner_company_id)");
    }
}
