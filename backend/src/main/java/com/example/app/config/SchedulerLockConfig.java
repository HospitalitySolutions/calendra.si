package com.example.app.config;

import javax.sql.DataSource;
import net.javacrumbs.shedlock.core.LockProvider;
import net.javacrumbs.shedlock.provider.jdbctemplate.JdbcTemplateLockProvider;
import net.javacrumbs.shedlock.spring.annotation.EnableSchedulerLock;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.jdbc.core.JdbcTemplate;

@Configuration
@EnableSchedulerLock(defaultLockAtMostFor = "PT10M")
public class SchedulerLockConfig {
    private static final String CREATE_SHEDLOCK_TABLE_SQL = """
            CREATE TABLE IF NOT EXISTS shedlock (
                name VARCHAR(255) NOT NULL,
                lock_until TIMESTAMP NOT NULL,
                locked_at TIMESTAMP NOT NULL,
                locked_by VARCHAR(255) NOT NULL,
                PRIMARY KEY (name)
            )
            """;

    @Bean
    public LockProvider lockProvider(DataSource dataSource) {
        JdbcTemplate jdbcTemplate = new JdbcTemplate(dataSource);
        ensureShedLockTableExists(jdbcTemplate);

        return new JdbcTemplateLockProvider(
                JdbcTemplateLockProvider.Configuration.builder()
                        .withJdbcTemplate(jdbcTemplate)
                        .usingDbTime()
                        .build()
        );
    }

    private void ensureShedLockTableExists(JdbcTemplate jdbcTemplate) {
        jdbcTemplate.execute(CREATE_SHEDLOCK_TABLE_SQL);
    }
}
