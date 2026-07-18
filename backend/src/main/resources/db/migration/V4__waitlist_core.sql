CREATE TABLE IF NOT EXISTS waitlist_requests (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
    guest_user_id BIGINT,
    service_id BIGINT NOT NULL REFERENCES session_type(id) ON DELETE RESTRICT,
    location_id BIGINT REFERENCES space(id) ON DELETE SET NULL,
    target_type VARCHAR(32) NOT NULL,
    target_session_id BIGINT REFERENCES session_booking(id) ON DELETE SET NULL,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    employee_preference_type VARCHAR(24) NOT NULL DEFAULT 'ANY',
    specific_employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    requested_participants INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    source VARCHAR(24) NOT NULL DEFAULT 'STAFF',
    notes VARCHAR(2000),
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    booked_booking_id BIGINT REFERENCES session_booking(id) ON DELETE SET NULL,
    duplicate_key VARCHAR(128) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_waitlist_request_dates CHECK (date_to >= date_from),
    CONSTRAINT chk_waitlist_request_participants CHECK (requested_participants > 0)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_company_status ON waitlist_requests(company_id, status, joined_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_company_dates ON waitlist_requests(company_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_duplicate ON waitlist_requests(company_id, duplicate_key, status);

CREATE TABLE IF NOT EXISTS waitlist_request_windows (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    day_of_week VARCHAR(16),
    date DATE,
    time_from TIME,
    time_to TIME,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_waitlist_window_time CHECK (all_day OR time_from IS NULL OR time_to IS NULL OR time_to > time_from)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_window_request ON waitlist_request_windows(waitlist_request_id);

CREATE TABLE IF NOT EXISTS waitlist_request_employees (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_waitlist_request_employee UNIQUE(waitlist_request_id, employee_id)
);

CREATE TABLE IF NOT EXISTS waitlist_offers (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    room_id BIGINT REFERENCES space(id) ON DELETE SET NULL,
    session_id BIGINT REFERENCES session_booking(id) ON DELETE SET NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    offered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    declined_at TIMESTAMP WITH TIME ZONE,
    secure_token_hash VARCHAR(128) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_waitlist_offer_slot CHECK (slot_end > slot_start)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_offer_company_status_expiry ON waitlist_offers(company_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_offer_request ON waitlist_offers(waitlist_request_id, offered_at);

CREATE TABLE IF NOT EXISTS waitlist_booking_holds (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    offer_id BIGINT NOT NULL UNIQUE REFERENCES waitlist_offers(id) ON DELETE CASCADE,
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    room_id BIGINT REFERENCES space(id) ON DELETE SET NULL,
    session_id BIGINT REFERENCES session_booking(id) ON DELETE SET NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_waitlist_hold_slot CHECK (slot_end > slot_start)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_hold_active_slot ON waitlist_booking_holds(company_id, status, slot_start, slot_end);

CREATE TABLE IF NOT EXISTS waitlist_events (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    offer_id BIGINT REFERENCES waitlist_offers(id) ON DELETE SET NULL,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(40) NOT NULL,
    detail VARCHAR(2000),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_waitlist_event_request_time ON waitlist_events(waitlist_request_id, occurred_at);

CREATE TABLE IF NOT EXISTS waitlist_slot_skips (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    skipped_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_skip_slot
    ON waitlist_slot_skips(waitlist_request_id, slot_start, COALESCE(employee_id, -1));

ALTER TABLE app_settings DROP CONSTRAINT IF EXISTS app_settings_key_check;
