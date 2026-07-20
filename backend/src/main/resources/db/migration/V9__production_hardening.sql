-- Production hardening:
-- 1) move billing precision changes out of application startup and into Flyway;
-- 2) align persisted numeric precision with the JPA mappings;
-- 3) remove the obsolete singular waitlist schema only when it is provably empty;
-- 4) add bounded-worker indexes used by scheduled jobs.

ALTER TABLE open_bill_items ADD COLUMN IF NOT EXISTS unit_gross_price NUMERIC(12,2);

ALTER TABLE open_bill_items
    ALTER COLUMN net_price TYPE NUMERIC(12,4) USING net_price::NUMERIC(12,4),
    ALTER COLUMN unit_gross_price TYPE NUMERIC(12,2) USING ROUND(unit_gross_price::NUMERIC, 2);

ALTER TABLE bill_item
    ALTER COLUMN net_price TYPE NUMERIC(12,4) USING net_price::NUMERIC(12,4),
    ALTER COLUMN gross_price TYPE NUMERIC(12,2) USING ROUND(gross_price::NUMERIC, 2);

ALTER TABLE transaction_service
    ALTER COLUMN net_price TYPE NUMERIC(12,4) USING net_price::NUMERIC(12,4);

ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS proforma_number VARCHAR(80);
ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS proforma_sequence_number BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_open_bills_company_proforma_number
    ON open_bills(company_id, proforma_number)
    WHERE proforma_number IS NOT NULL;

-- Gross is the user-entered source of truth. Backfill only missing snapshots and
-- retain the higher-precision transaction-service net value when a legacy row
-- was previously rounded to two decimals.
UPDATE open_bill_items obi
SET unit_gross_price = ROUND((COALESCE(
    CASE
        WHEN ROUND(COALESCE(obi.net_price, 0), 2) = ROUND(COALESCE(ts.net_price, 0), 2)
            THEN ts.net_price
        ELSE obi.net_price
    END,
    0
) *
    CASE ts.tax_rate
        WHEN 'VAT_22' THEN 1.22
        WHEN 'VAT_9_5' THEN 1.095
        ELSE 1
    END)::NUMERIC, 2)
FROM transaction_service ts
WHERE obi.transaction_service_id = ts.id
  AND obi.unit_gross_price IS NULL;

-- V4 created an obsolete singular waitlist model and V5 introduced the
-- canonical plural model used by the application. Never discard legacy data
-- silently: fail the migration if any singular table contains rows.
DO $$
DECLARE
    table_name TEXT;
    row_count BIGINT;
BEGIN
    FOREACH table_name IN ARRAY ARRAY[
        'waitlist_event',
        'waitlist_offer',
        'booking_hold',
        'waitlist_request_employee',
        'waitlist_request_window',
        'waitlist_request'
    ] LOOP
        IF to_regclass('public.' || table_name) IS NOT NULL THEN
            EXECUTE format('SELECT count(*) FROM %I', table_name) INTO row_count;
            IF row_count > 0 THEN
                RAISE EXCEPTION
                    'Legacy table % contains % row(s). Migrate these rows to the canonical plural waitlist schema before applying V9.',
                    table_name, row_count;
            END IF;
        END IF;
    END LOOP;
END $$;

DROP TABLE IF EXISTS waitlist_event;
DROP TABLE IF EXISTS waitlist_offer;
DROP TABLE IF EXISTS booking_hold;
DROP TABLE IF EXISTS waitlist_request_employee;
DROP TABLE IF EXISTS waitlist_request_window;
DROP TABLE IF EXISTS waitlist_request;

CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
    ON scheduled_messages(status, next_run_at, id);

CREATE INDEX IF NOT EXISTS idx_waitlist_offers_pending_expiry
    ON waitlist_offers(expires_at, id)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_waitlist_holds_active_expiry
    ON waitlist_booking_holds(expires_at, id)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_client_messages_latest_open
    ON client_messages(company_id, client_id, created_at DESC, id DESC)
    INCLUDE (conversation_key, channel)
    WHERE conversation_closed = FALSE;

-- Online meeting provisioning is durable and happens after the booking transaction,
-- so Zoom/Google latency never holds the per-tenant booking lock.
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_status VARCHAR(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_error VARCHAR(1000);
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_next_attempt_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_confirmation_pending BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE session_booking
SET meeting_provisioning_status = CASE
    WHEN meeting_link IS NOT NULL AND trim(meeting_link) <> '' THEN 'READY'
    ELSE 'NONE'
END
WHERE meeting_provisioning_status IS NULL OR meeting_provisioning_status = 'NONE';

CREATE INDEX IF NOT EXISTS idx_session_booking_meeting_provisioning_due
    ON session_booking(meeting_provisioning_status, meeting_provisioning_next_attempt_at, id)
    WHERE meeting_link IS NULL
      AND meeting_provisioning_status IN ('PENDING', 'RETRY', 'PROCESSING');
