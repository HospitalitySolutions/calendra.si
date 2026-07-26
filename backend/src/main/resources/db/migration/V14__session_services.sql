ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS availability_end_time TIMESTAMP;

CREATE TABLE IF NOT EXISTS session_service (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    session_booking_id BIGINT NOT NULL,
    session_type_id BIGINT NOT NULL,
    space_id BIGINT,
    position INTEGER NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    service_name_snapshot VARCHAR(255) NOT NULL,
    color_snapshot VARCHAR(20),
    duration_minutes_snapshot INTEGER NOT NULL,
    break_minutes_snapshot INTEGER NOT NULL,
    price_calculation_mode_snapshot VARCHAR(24) NOT NULL,
    service_group_id_snapshot BIGINT,
    service_group_name_snapshot VARCHAR(120),
    CONSTRAINT fk_session_service_booking
        FOREIGN KEY (session_booking_id) REFERENCES session_booking(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_service_type
        FOREIGN KEY (session_type_id) REFERENCES session_type(id),
    CONSTRAINT fk_session_service_space
        FOREIGN KEY (space_id) REFERENCES space(id),
    CONSTRAINT chk_session_service_position CHECK (position >= 0),
    CONSTRAINT chk_session_service_time_order CHECK (end_time > start_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_session_service_booking_position
    ON session_service (session_booking_id, position);
CREATE INDEX IF NOT EXISTS idx_session_service_booking
    ON session_service (session_booking_id, position, id);
CREATE INDEX IF NOT EXISTS idx_session_service_type
    ON session_service (session_type_id);
CREATE INDEX IF NOT EXISTS idx_session_service_space_time
    ON session_service (space_id, start_time, end_time)
    WHERE space_id IS NOT NULL;

INSERT INTO session_service (
    created_at,
    updated_at,
    session_booking_id,
    session_type_id,
    space_id,
    position,
    start_time,
    end_time,
    service_name_snapshot,
    color_snapshot,
    duration_minutes_snapshot,
    break_minutes_snapshot,
    price_calculation_mode_snapshot,
    service_group_id_snapshot,
    service_group_name_snapshot
)
SELECT
    COALESCE(sb.created_at, NOW()),
    COALESCE(sb.updated_at, NOW()),
    sb.id,
    sb.type_id,
    sb.space_id,
    0,
    sb.start_time,
    sb.end_time,
    COALESCE(st.name, 'Service'),
    st.color,
    GREATEST(1, FLOOR(EXTRACT(EPOCH FROM (sb.end_time - sb.start_time)) / 60)::INTEGER),
    GREATEST(0, COALESCE(st.break_minutes, 0)),
    COALESCE(st.price_calculation_mode, 'PER_CLIENT'),
    st.service_group_id,
    sg.name
FROM session_booking sb
JOIN session_type st ON st.id = sb.type_id
LEFT JOIN service_group sg ON sg.id = st.service_group_id
WHERE NOT EXISTS (
    SELECT 1 FROM session_service existing WHERE existing.session_booking_id = sb.id
);

UPDATE session_booking sb
SET availability_end_time = sb.end_time + (GREATEST(0, COALESCE(st.break_minutes, 0)) * INTERVAL '1 minute')
FROM session_type st
WHERE sb.type_id = st.id
  AND sb.availability_end_time IS NULL;

UPDATE session_booking
SET availability_end_time = end_time
WHERE availability_end_time IS NULL;

ALTER TABLE session_booking
    ALTER COLUMN availability_end_time SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_booking_company_availability
    ON session_booking (company_id, start_time, availability_end_time, id);
