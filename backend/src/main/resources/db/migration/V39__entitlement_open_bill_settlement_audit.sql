-- Preserve an internal audit trail when a prepaid membership/pass settles an open bill
-- without issuing a second invoice. The open bill itself is deleted after settlement, so
-- source_open_bill_id intentionally has no foreign key.
ALTER TABLE guest_entitlement_usages
    ADD COLUMN IF NOT EXISTS source_open_bill_id BIGINT;

ALTER TABLE guest_entitlement_usages
    ADD COLUMN IF NOT EXISTS covered_gross NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_guest_entitlement_usage_open_bill
    ON guest_entitlement_usages (source_open_bill_id)
    WHERE source_open_bill_id IS NOT NULL;
