CREATE TABLE IF NOT EXISTS platform_demo_booking_profiles (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    slot_step_minutes INTEGER NOT NULL DEFAULT 30,
    buffer_before_minutes INTEGER NOT NULL DEFAULT 10,
    buffer_after_minutes INTEGER NOT NULL DEFAULT 10,
    minimum_notice_minutes INTEGER NOT NULL DEFAULT 1440,
    booking_horizon_days INTEGER NOT NULL DEFAULT 30,
    maximum_bookings_per_day INTEGER NOT NULL DEFAULT 4,
    time_zone VARCHAR(80) NOT NULL DEFAULT 'Europe/Ljubljana',
    meeting_provider VARCHAR(24) NOT NULL DEFAULT 'GOOGLE_MEET',
    host_user_id BIGINT REFERENCES users(id),
    availability_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_demo_bookings (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    profile_id BIGINT NOT NULL REFERENCES platform_demo_booking_profiles(id),
    host_user_id BIGINT NOT NULL REFERENCES users(id),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
    guest_name VARCHAR(200) NOT NULL,
    guest_email VARCHAR(320) NOT NULL,
    guest_phone VARCHAR(80),
    company_name VARCHAR(240) NOT NULL,
    guest_note VARCHAR(2000),
    guest_time_zone VARCHAR(80) NOT NULL,
    locale VARCHAR(8) NOT NULL DEFAULT 'sl',
    meeting_provider VARCHAR(24) NOT NULL,
    meeting_join_url VARCHAR(1000),
    external_meeting_id VARCHAR(255),
    calendar_block_id BIGINT,
    manage_token VARCHAR(100) NOT NULL UNIQUE,
    utm_source VARCHAR(200),
    utm_medium VARCHAR(200),
    utm_campaign VARCHAR(200),
    cancelled_at TIMESTAMPTZ,
    reminder_24h_sent_at TIMESTAMPTZ,
    reminder_1h_sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS platform_demo_booking_holds (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    profile_id BIGINT NOT NULL REFERENCES platform_demo_booking_profiles(id) ON DELETE CASCADE,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    hold_token VARCHAR(100) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_demo_bookings_profile_time
    ON platform_demo_bookings(profile_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_platform_demo_bookings_status_time
    ON platform_demo_bookings(status, start_at);
CREATE INDEX IF NOT EXISTS idx_platform_demo_booking_holds_profile_time
    ON platform_demo_booking_holds(profile_id, expires_at, start_at, end_at);
