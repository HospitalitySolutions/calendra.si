CREATE TABLE IF NOT EXISTS booking_slot_holds (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    consultant_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    group_session_id BIGINT REFERENCES session_booking(id) ON DELETE CASCADE,
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    busy_end TIMESTAMP NOT NULL,
    slot_id VARCHAR(500) NOT NULL,
    hold_token VARCHAR(100) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT chk_booking_slot_hold_window CHECK (slot_end > slot_start AND busy_end >= slot_end)
);

CREATE INDEX IF NOT EXISTS idx_booking_slot_holds_company_employee_window
    ON booking_slot_holds (company_id, consultant_id, expires_at, slot_start, busy_end);
CREATE INDEX IF NOT EXISTS idx_booking_slot_holds_company_group
    ON booking_slot_holds (company_id, group_session_id, expires_at);

ALTER TABLE calendar_todos
    ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE calendar_todos
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_calendar_todos_company_completed_time
    ON calendar_todos (company_id, completed, start_time);
