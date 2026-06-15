-- ShedLock table used by scheduled jobs in multi-instance staging/production deployments.
-- Keep this in Flyway so the application does not perform schema creation at runtime.
CREATE TABLE IF NOT EXISTS shedlock (
    name VARCHAR(255) NOT NULL,
    lock_until TIMESTAMP NOT NULL,
    locked_at TIMESTAMP NOT NULL,
    locked_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);

-- Date-range endpoints now query bookings directly in PostgreSQL. These non-partial indexes cover
-- all statuses, including CANCELLED/NO_SHOW rows that the calendar may still need to display/filter.
DO $$
BEGIN
    IF to_regclass('public.session_booking') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_time_all
                 ON session_booking (company_id, start_time, end_time, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_consultant_time_all
                 ON session_booking (company_id, consultant_id, start_time, end_time, id)
                 WHERE consultant_id IS NOT NULL';
    END IF;

    IF to_regclass('public.open_bills') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_open_bills_company_session_booking
                 ON open_bills (company_id, session_booking_id)
                 WHERE session_booking_id IS NOT NULL';
    END IF;

    IF to_regclass('public.open_bill_items') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_open_bill_items_source_session_booking
                 ON open_bill_items (source_session_booking_id, open_bill_id)
                 WHERE source_session_booking_id IS NOT NULL';
    END IF;
END $$;
