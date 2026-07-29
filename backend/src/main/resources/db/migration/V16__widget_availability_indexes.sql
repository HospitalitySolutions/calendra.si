-- Fast overlap lookups used by the website booking widget.
CREATE INDEX IF NOT EXISTS idx_personal_calendar_block_company_time
    ON personal_calendar_block (company_id, start_time, end_time, owner_id);

CREATE INDEX IF NOT EXISTS idx_personal_calendar_block_availability_marker
    ON personal_calendar_block (company_id, owner_id)
    WHERE lower(task) = '__availability_block__';

-- availability_end_time is the authoritative busy endpoint, including the final service break.
CREATE INDEX IF NOT EXISTS idx_session_booking_company_busy_window_active
    ON session_booking (company_id, start_time, availability_end_time, consultant_id)
    WHERE upper(coalesce(booking_status, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW');
