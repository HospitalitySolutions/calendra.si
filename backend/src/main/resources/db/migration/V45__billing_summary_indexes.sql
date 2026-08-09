-- Phase 2 billing performance: support lightweight tab counters and advance-balance aggregation.
CREATE INDEX IF NOT EXISTS idx_bills_company_type_status_location
    ON bills (company_id, bill_type, payment_status, location_id, id);

CREATE INDEX IF NOT EXISTS idx_advance_allocations_company_advance
    ON advance_allocations (company_id, advance_bill_id);

CREATE INDEX IF NOT EXISTS idx_bill_item_source_advance
    ON bill_item (source_advance_bill_id)
    WHERE source_advance_bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_open_bill_payments_source_advance
    ON open_bill_payments (source_advance_bill_id)
    WHERE source_advance_bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bill_payments_source_advance
    ON bill_payments (source_advance_bill_id)
    WHERE source_advance_bill_id IS NOT NULL;
