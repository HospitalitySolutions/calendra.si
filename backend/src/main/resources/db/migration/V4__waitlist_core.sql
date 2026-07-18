CREATE TABLE waitlist_request (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES company(id),
    client_id BIGINT REFERENCES clients(id),
    guest_user_id VARCHAR(64),
    service_id BIGINT REFERENCES session_type(id),
    location_id BIGINT,
    target_type VARCHAR(32) NOT NULL,
    target_session_id BIGINT REFERENCES session_booking(id),
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    employee_preference_type VARCHAR(32) NOT NULL DEFAULT 'ANY',
    specific_employee_id BIGINT REFERENCES users(id),
    requested_participants INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    source VARCHAR(32) NOT NULL DEFAULT 'STAFF',
    notes VARCHAR(1000),
    joined_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP,
    booked_booking_id BIGINT REFERENCES session_booking(id),
    duplicate_key VARCHAR(512),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX uq_waitlist_active_duplicate
    ON waitlist_request(company_id, duplicate_key)
    WHERE status IN ('ACTIVE', 'OFFERED');

CREATE INDEX ix_waitlist_request_company_status
    ON waitlist_request(company_id, status, joined_at);

CREATE TABLE waitlist_request_window (
    id BIGSERIAL PRIMARY KEY,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_request(id) ON DELETE CASCADE,
    day_of_week INTEGER,
    requested_date DATE,
    time_from TIME,
    time_to TIME,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE waitlist_request_employee (
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_request(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES users(id),
    PRIMARY KEY(waitlist_request_id, employee_id)
);

CREATE TABLE booking_hold (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES company(id),
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    employee_id BIGINT REFERENCES users(id),
    room_id BIGINT REFERENCES space(id),
    session_id BIGINT REFERENCES session_booking(id),
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMP NOT NULL,
    override_allowed BOOLEAN NOT NULL DEFAULT TRUE,
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_booking_hold_active_slot
    ON booking_hold(company_id, slot_start, slot_end, status, expires_at);

CREATE TABLE waitlist_offer (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES company(id),
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_request(id),
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    employee_id BIGINT REFERENCES users(id),
    room_id BIGINT REFERENCES space(id),
    session_id BIGINT REFERENCES session_booking(id),
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    offered_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    accepted_at TIMESTAMP,
    declined_at TIMESTAMP,
    booking_hold_id BIGINT REFERENCES booking_hold(id),
    secure_token_hash VARCHAR(128),
    version BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX ix_waitlist_offer_company_status
    ON waitlist_offer(company_id, status, expires_at);

CREATE TABLE waitlist_event (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES company(id),
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_request(id) ON DELETE CASCADE,
    event_type VARCHAR(32) NOT NULL,
    actor_type VARCHAR(32),
    actor_id VARCHAR(64),
    details_json TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);
