package com.example.app.fiscal;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class FiscalSchemaCompatFix {
    public FiscalSchemaCompatFix(JdbcTemplate jdbcTemplate) {
        // Backward-compatibility for legacy schema where certificate_data (OID/LOB) is NOT NULL.
        // New flow writes certificate_data_bytes (bytea), so legacy column must allow NULL.
        try {
            jdbcTemplate.execute(
                    "ALTER TABLE IF EXISTS fiscal_certificates " +
                    "ALTER COLUMN certificate_data DROP NOT NULL"
            );
        } catch (Exception ignored) {
            // Ignore when table/column does not exist or permission is limited.
        }
    }
}
