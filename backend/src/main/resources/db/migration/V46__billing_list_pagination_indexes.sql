-- Phase 2.2 billing performance: support server-paged billing lists.
-- Existing baseline indexes cover company/date and source-advance lookups; these
-- composites target the location-aware history and open-payment access paths.
CREATE INDEX IF NOT EXISTS idx_bills_company_location_issue_date_id
    ON bills (company_id, location_id, issue_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_bills_company_open_payment_location_issue_date_id
    ON bills (company_id, location_id, issue_date DESC, id DESC)
    WHERE payment_status <> 'paid' AND payment_status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_guest_entitlements_company_created_id
    ON guest_entitlements (company_id, created_at DESC, id DESC);
