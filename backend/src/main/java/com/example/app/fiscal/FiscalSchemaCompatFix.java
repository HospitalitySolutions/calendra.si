package com.example.app.fiscal;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class FiscalSchemaCompatFix {
    public FiscalSchemaCompatFix(JdbcTemplate jdbcTemplate) {
        // Backward-compatibility for legacy schema where certificate_data (OID/LOB) is NOT NULL.
        // New flow writes certificate_data_bytes (bytea), so legacy column must allow NULL.
        try {
            Boolean hasLegacyColumn = jdbcTemplate.queryForObject(
                    """
                    SELECT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_name = 'fiscal_certificates'
                          AND column_name = 'certificate_data'
                    )
                    """,
                    Boolean.class);
            if (Boolean.TRUE.equals(hasLegacyColumn)) {
                jdbcTemplate.execute(
                        "ALTER TABLE fiscal_certificates " +
                        "ALTER COLUMN certificate_data DROP NOT NULL"
                );
            }
        } catch (Exception ignored) {
            // Ignore when table/column does not exist or permission is limited.
        }
    }
}
