package com.example.app.settings;

import java.util.Arrays;
import java.util.stream.Collectors;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Keeps PostgreSQL enum-like check constraint on {@code app_settings.key} in sync
 * with {@link SettingKey} values. Needed when new keys are added after table creation.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class AppSettingsKeyConstraintMigration implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(AppSettingsKeyConstraintMigration.class);

    private final JdbcTemplate jdbc;

    public AppSettingsKeyConstraintMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        String allowedKeys = Arrays.stream(SettingKey.values())
                .map(SettingKey::name)
                .map(v -> "'" + v.replace("'", "''") + "'")
                .collect(Collectors.joining(", "));
        try {
            jdbc.execute("""
                    DO $$
                    DECLARE
                        rec RECORD;
                    BEGIN
                        FOR rec IN
                            SELECT con.conname
                            FROM pg_constraint con
                            WHERE con.conrelid = to_regclass('app_settings')
                              AND con.contype = 'c'
                              AND (
                                  con.conname ILIKE '%key%'
                                  OR pg_get_constraintdef(con.oid) ILIKE '%key%'
                              )
                        LOOP
                            EXECUTE format('ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS %I', rec.conname);
                        END LOOP;
                    END $$;
                    """);
            jdbc.execute("ALTER TABLE app_settings ADD CONSTRAINT app_settings_key_check CHECK (\"key\" IN (" + allowedKeys + "))");
        } catch (Exception ex) {
            // Non-PostgreSQL, missing table, or environments where this DDL is unsupported.
            log.warn("App settings key constraint migration skipped: {}", ex.getMessage());
        }
    }
}

