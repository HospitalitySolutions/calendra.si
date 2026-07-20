-- Phase B/C: service-group waitlist scopes and historical service-group analytics snapshots.

ALTER TABLE waitlist_requests
    ADD COLUMN IF NOT EXISTS service_scope VARCHAR(24) NOT NULL DEFAULT 'EXACT_SERVICE',
    ADD COLUMN IF NOT EXISTS service_group_id BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_id_snapshot BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_name_snapshot VARCHAR(120);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waitlist_request_service_group') THEN
        ALTER TABLE waitlist_requests
            ADD CONSTRAINT fk_waitlist_request_service_group
            FOREIGN KEY (service_group_id) REFERENCES service_group(id) ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE waitlist_requests ALTER COLUMN service_id DROP NOT NULL;

UPDATE waitlist_requests wr
SET service_group_id_snapshot = st.service_group_id,
    service_group_name_snapshot = sg.name
FROM session_type st
LEFT JOIN service_group sg ON sg.id = st.service_group_id
WHERE wr.service_id = st.id
  AND wr.service_group_id_snapshot IS NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_request_service_scope
    ON waitlist_requests(company_id, service_scope, service_group_id, service_id);

CREATE TABLE IF NOT EXISTS waitlist_request_services (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    service_id BIGINT REFERENCES session_type(id) ON DELETE SET NULL,
    service_name_snapshot VARCHAR(255) NOT NULL,
    service_group_id_snapshot BIGINT,
    service_group_name_snapshot VARCHAR(120),
    duration_minutes_snapshot INTEGER,
    sort_order_snapshot INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_waitlist_request_service UNIQUE(waitlist_request_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_services_request
    ON waitlist_request_services(waitlist_request_id, sort_order_snapshot, id);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_services_service
    ON waitlist_request_services(service_id, waitlist_request_id);

INSERT INTO waitlist_request_services (
    created_at, updated_at, waitlist_request_id, service_id, service_name_snapshot,
    service_group_id_snapshot, service_group_name_snapshot, duration_minutes_snapshot, sort_order_snapshot
)
SELECT CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, wr.id, st.id, st.name,
       st.service_group_id, sg.name, COALESCE(st.duration_minutes, 60), COALESCE(st.guest_sort_order, 0)
FROM waitlist_requests wr
JOIN session_type st ON st.id = wr.service_id
LEFT JOIN service_group sg ON sg.id = st.service_group_id
ON CONFLICT (waitlist_request_id, service_id) DO NOTHING;

ALTER TABLE waitlist_offers
    ADD COLUMN IF NOT EXISTS service_id BIGINT,
    ADD COLUMN IF NOT EXISTS service_name_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS service_group_id_snapshot BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_name_snapshot VARCHAR(120),
    ADD COLUMN IF NOT EXISTS available_slot_end TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waitlist_offer_service') THEN
        ALTER TABLE waitlist_offers
            ADD CONSTRAINT fk_waitlist_offer_service
            FOREIGN KEY (service_id) REFERENCES session_type(id) ON DELETE RESTRICT;
    END IF;
END $$;

UPDATE waitlist_offers wo
SET service_id = wr.service_id,
    service_name_snapshot = st.name,
    service_group_id_snapshot = st.service_group_id,
    service_group_name_snapshot = sg.name
FROM waitlist_requests wr
JOIN session_type st ON st.id = wr.service_id
LEFT JOIN service_group sg ON sg.id = st.service_group_id
WHERE wo.waitlist_request_id = wr.id
  AND wo.service_id IS NULL;

UPDATE waitlist_offers
SET available_slot_end = slot_end
WHERE available_slot_end IS NULL;

ALTER TABLE waitlist_offers ALTER COLUMN service_id SET NOT NULL;
ALTER TABLE waitlist_offers ALTER COLUMN service_name_snapshot SET NOT NULL;
ALTER TABLE waitlist_offers ALTER COLUMN available_slot_end SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waitlist_offer_service_group_snapshot
    ON waitlist_offers(company_id, service_group_id_snapshot, offered_at);

ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS service_group_id_snapshot BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_name_snapshot VARCHAR(120),
    ADD COLUMN IF NOT EXISTS service_group_snapshot_captured BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE session_booking sb
SET service_group_id_snapshot = st.service_group_id,
    service_group_name_snapshot = sg.name
FROM session_type st
LEFT JOIN service_group sg ON sg.id = st.service_group_id
WHERE sb.type_id = st.id
  AND sb.service_group_snapshot_captured = FALSE;

UPDATE session_booking SET service_group_snapshot_captured = TRUE
WHERE service_group_snapshot_captured = FALSE;

CREATE INDEX IF NOT EXISTS idx_session_booking_group_snapshot
    ON session_booking(company_id, service_group_id_snapshot, start_time, id);

ALTER TABLE bill_item
    ADD COLUMN IF NOT EXISTS service_group_id_snapshot BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_name_snapshot VARCHAR(120),
    ADD COLUMN IF NOT EXISTS service_group_snapshot_captured BOOLEAN NOT NULL DEFAULT FALSE;

UPDATE bill_item bi
SET service_group_id_snapshot = sb.service_group_id_snapshot,
    service_group_name_snapshot = sb.service_group_name_snapshot
FROM session_booking sb
WHERE bi.source_session_booking_id = sb.id
  AND bi.service_group_snapshot_captured = FALSE;

UPDATE bill_item SET service_group_snapshot_captured = TRUE
WHERE source_session_booking_id IS NOT NULL AND service_group_snapshot_captured = FALSE;

CREATE INDEX IF NOT EXISTS idx_bill_item_group_snapshot
    ON bill_item(service_group_id_snapshot, source_session_booking_id, id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_waitlist_request_service_scope') THEN
        ALTER TABLE waitlist_requests
            ADD CONSTRAINT chk_waitlist_request_service_scope CHECK (
                (service_scope = 'EXACT_SERVICE' AND service_id IS NOT NULL)
                OR (service_scope = 'SERVICE_GROUP' AND service_group_id_snapshot IS NOT NULL)
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_waitlist_offer_available_slot') THEN
        ALTER TABLE waitlist_offers
            ADD CONSTRAINT chk_waitlist_offer_available_slot CHECK (
                available_slot_end >= slot_end
            );
    END IF;
END $$;
