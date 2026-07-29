-- Additional indexes for fast employee-specific month availability in the website widget.
-- V16 remains unchanged so already-deployed Flyway histories keep their checksum.

CREATE INDEX IF NOT EXISTS idx_session_booking_widget_consultant_busy
    ON session_booking (company_id, consultant_id, start_time, availability_end_time)
    WHERE upper(coalesce(booking_status, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW');

CREATE INDEX IF NOT EXISTS idx_bookable_slot_widget_month
    ON bookable_slot (company_id, consultant_id, day_of_week, start_date, end_date, indefinite);

CREATE INDEX IF NOT EXISTS idx_waitlist_hold_widget_month
    ON waitlist_booking_holds (company_id, status, expires_at, slot_start, slot_end, employee_id, room_id);
