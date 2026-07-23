ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS booking_source VARCHAR(32);

UPDATE session_booking
SET booking_source = CASE
    WHEN UPPER(COALESCE(source_channel, '')) IN ('GUEST_APP', 'MOBILE_APP') THEN 'MOBILE_APP'
    WHEN UPPER(COALESCE(source_channel, '')) = 'WEBSITE_WIDGET' THEN 'WEBSITE_WIDGET'
    WHEN UPPER(COALESCE(source_channel, '')) = 'PUBLIC_BOOKING_PAGE' THEN 'PUBLIC_BOOKING_PAGE'
    ELSE 'MANUAL'
END
WHERE booking_source IS NULL OR TRIM(booking_source) = '';

ALTER TABLE session_booking
    ALTER COLUMN booking_source SET DEFAULT 'MANUAL';

ALTER TABLE session_booking
    ALTER COLUMN booking_source SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_session_booking_booking_source'
    ) THEN
        ALTER TABLE session_booking
            ADD CONSTRAINT chk_session_booking_booking_source
            CHECK (booking_source IN ('MANUAL', 'MOBILE_APP', 'WEBSITE_WIDGET', 'PUBLIC_BOOKING_PAGE'));
    END IF;
END $$;
