ALTER TABLE platform_demo_bookings
    ADD COLUMN IF NOT EXISTS session_booking_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_platform_demo_booking_session_booking'
    ) THEN
        ALTER TABLE platform_demo_bookings
            ADD CONSTRAINT fk_platform_demo_booking_session_booking
            FOREIGN KEY (session_booking_id) REFERENCES session_booking(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_demo_bookings_session_booking
    ON platform_demo_bookings(session_booking_id);
