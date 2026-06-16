CREATE TABLE IF NOT EXISTS course_access_progress (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    entitlement_id BIGINT NOT NULL,
    course_id BIGINT NOT NULL,
    position_seconds INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER,
    progress_percent NUMERIC(6, 2) NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    last_played_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uk_course_access_progress_entitlement_course UNIQUE (entitlement_id, course_id),
    CONSTRAINT fk_course_access_progress_entitlement FOREIGN KEY (entitlement_id) REFERENCES guest_entitlements(id) ON DELETE CASCADE,
    CONSTRAINT fk_course_access_progress_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_course_access_progress_entitlement ON course_access_progress(entitlement_id);
CREATE INDEX IF NOT EXISTS idx_course_access_progress_course ON course_access_progress(course_id);
