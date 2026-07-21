-- Align the remaining billing columns with their JPA precision/scale mappings.
-- Keep this in a new migration instead of editing V1/V9, because those
-- migrations may already be recorded in existing environments.

ALTER TABLE advance_allocations
    ALTER COLUMN amount_net TYPE NUMERIC(12,2)
    USING ROUND(amount_net::NUMERIC, 2);

ALTER TABLE bills
    ALTER COLUMN total_net TYPE NUMERIC(12,2)
    USING ROUND(total_net::NUMERIC, 2),
    ALTER COLUMN total_gross TYPE NUMERIC(12,2)
    USING ROUND(total_gross::NUMERIC, 2);

ALTER TABLE bill_payments
    ALTER COLUMN amount_gross TYPE NUMERIC(12,2)
    USING ROUND(amount_gross::NUMERIC, 2);

ALTER TABLE open_bill_payments
    ALTER COLUMN amount_gross TYPE NUMERIC(12,2)
    USING ROUND(amount_gross::NUMERIC, 2);
