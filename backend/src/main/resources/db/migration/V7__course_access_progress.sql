CREATE TABLE IF NOT EXISTS course_access_progress (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    guest_entitlement_id BIGINT NOT NULL,
    course_id BIGINT NOT NULL,
    position_seconds INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER,
    progress_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    completed_at TIMESTAMPTZ,
    last_played_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_course_access_progress_entitlement
        FOREIGN KEY (guest_entitlement_id) REFERENCES guest_entitlements(id) ON DELETE CASCADE,
    CONSTRAINT fk_course_access_progress_course
        FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    CONSTRAINT uk_course_access_progress_entitlement_course
        UNIQUE (guest_entitlement_id, course_id),
    CONSTRAINT chk_course_access_progress_position_nonnegative
        CHECK (position_seconds >= 0),
    CONSTRAINT chk_course_access_progress_duration_positive
        CHECK (duration_seconds IS NULL OR duration_seconds > 0),
    CONSTRAINT chk_course_access_progress_percent_range
        CHECK (progress_percent >= 0 AND progress_percent <= 100)
);

CREATE INDEX IF NOT EXISTS idx_course_access_progress_entitlement
    ON course_access_progress (guest_entitlement_id);

CREATE INDEX IF NOT EXISTS idx_course_access_progress_course
    ON course_access_progress (course_id);

CREATE INDEX IF NOT EXISTS idx_course_access_progress_last_played
    ON course_access_progress (last_played_at DESC);
