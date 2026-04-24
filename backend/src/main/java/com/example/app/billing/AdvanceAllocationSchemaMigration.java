package com.example.app.billing;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

@Component
public class AdvanceAllocationSchemaMigration implements ApplicationRunner {
    private final JdbcTemplate jdbc;

    public AdvanceAllocationSchemaMigration(JdbcTemplate jdbcTemplate) {
        this.jdbc = jdbcTemplate;
    }

    @Override
    public void run(ApplicationArguments args) {
        try {
            jdbc.execute("""
                    CREATE TABLE IF NOT EXISTS advance_allocations (
                        id BIGSERIAL PRIMARY KEY,
                        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                        company_id BIGINT NOT NULL,
                        advance_bill_id BIGINT NOT NULL,
                        open_bill_id BIGINT NOT NULL,
                        session_booking_id BIGINT NOT NULL,
                        transaction_service_id BIGINT NOT NULL,
                        amount_net NUMERIC(12,2) NOT NULL
                    )
                    """);
        } catch (Exception ignored) {}
        try { jdbc.execute("CREATE INDEX IF NOT EXISTS idx_adv_alloc_company_advance ON advance_allocations(company_id, advance_bill_id)"); } catch (Exception ignored) {}
        try { jdbc.execute("CREATE INDEX IF NOT EXISTS idx_adv_alloc_company_open ON advance_allocations(company_id, open_bill_id)"); } catch (Exception ignored) {}
    }
}
