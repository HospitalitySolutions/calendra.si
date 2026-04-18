package com.example.app.company;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class CompanyTenantCodeMigration implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(CompanyTenantCodeMigration.class);

    private final JdbcTemplate jdbc;

    public CompanyTenantCodeMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("ALTER TABLE company ADD COLUMN IF NOT EXISTS tenant_code VARCHAR(64)");
            jdbc.execute("UPDATE company SET tenant_code = id::text || UPPER(LEFT(REGEXP_REPLACE(COALESCE(name, ''), '[^A-Za-z0-9]', '', 'g') || 'XXX', 3)) WHERE tenant_code IS NULL OR tenant_code = ''");
            jdbc.execute("ALTER TABLE company ALTER COLUMN tenant_code DROP NOT NULL");
            jdbc.execute("CREATE UNIQUE INDEX IF NOT EXISTS uk_company_tenant_code ON company (tenant_code)");
        } catch (Exception ex) {
            log.warn("Company tenant code migration skipped: {}", ex.getMessage());
        }
    }
}
