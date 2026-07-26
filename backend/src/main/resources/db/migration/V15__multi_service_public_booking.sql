ALTER TABLE guest_entitlement_usages
    ADD COLUMN IF NOT EXISTS session_service_id BIGINT;

ALTER TABLE guest_entitlement_usages
    DROP CONSTRAINT IF EXISTS fk_guest_entitlement_usage_session_service;
ALTER TABLE guest_entitlement_usages
    ADD CONSTRAINT fk_guest_entitlement_usage_session_service
        FOREIGN KEY (session_service_id) REFERENCES session_service(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_entitlement_usage_session_service
    ON guest_entitlement_usages (session_service_id)
    WHERE session_service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_entitlement_usage_booking_service
    ON guest_entitlement_usages (session_booking_id, session_service_id);

ALTER TABLE waitlist_requests
    ADD COLUMN IF NOT EXISTS service_chain BOOLEAN NOT NULL DEFAULT FALSE;
