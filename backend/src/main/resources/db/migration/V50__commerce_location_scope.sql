-- Phase 5.5C: explicit all/selected Location scope for commerce definitions and wallet rights.

ALTER TABLE guest_products
    ADD COLUMN IF NOT EXISTS available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS guest_product_locations (
    product_id BIGINT NOT NULL REFERENCES guest_products(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_guest_product_locations_location ON guest_product_locations(location_id, product_id);

ALTER TABLE payment_methods
    ADD COLUMN IF NOT EXISTS available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS payment_method_locations (
    payment_method_id BIGINT NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (payment_method_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_method_locations_location ON payment_method_locations(location_id, payment_method_id);

ALTER TABLE guest_entitlements
    ADD COLUMN IF NOT EXISTS available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS guest_entitlement_locations (
    entitlement_id BIGINT NOT NULL REFERENCES guest_entitlements(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (entitlement_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_guest_entitlement_locations_location ON guest_entitlement_locations(location_id, entitlement_id);

-- Resolve historical product-only orders before entitlement-usage backfill so standalone usage can
-- inherit the most accurate reconstructed branch. Prefer a directly linked draft/final invoice location;
-- otherwise use the company's default/first location.
UPDATE guest_orders go
SET location_id = ob.location_id
FROM open_bills ob
WHERE go.location_id IS NULL
  AND ob.source_guest_order_id = go.id
  AND ob.location_id IS NOT NULL;

UPDATE guest_orders go
SET location_id = b.location_id
FROM bills b
WHERE go.location_id IS NULL
  AND go.bill_id = b.id
  AND b.location_id IS NOT NULL;

UPDATE guest_orders go
SET location_id = (
    SELECT l.id
    FROM locations l
    WHERE l.company_id = go.company_id
    ORDER BY l.default_location DESC, l.active DESC, l.name ASC, l.id ASC
    LIMIT 1
)
WHERE go.location_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM guest_orders WHERE location_id IS NULL) THEN
        RAISE EXCEPTION 'Cannot make guest_orders.location_id mandatory: one or more companies have no location';
    END IF;
END $$;

ALTER TABLE guest_orders ALTER COLUMN location_id SET NOT NULL;


-- Every entitlement consumption is operational activity and therefore carries the physical branch
-- where it happened. Booking-linked usages inherit the booking branch; historical standalone scans
-- fall back to the originating order branch and finally to the company's default/first branch.
ALTER TABLE guest_entitlement_usages
    ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES locations(id) ON DELETE RESTRICT;

UPDATE guest_entitlement_usages usage
SET location_id = booking.location_id
FROM session_booking booking
WHERE usage.location_id IS NULL
  AND usage.session_booking_id = booking.id
  AND booking.location_id IS NOT NULL;

UPDATE guest_entitlement_usages usage
SET location_id = source_order.location_id
FROM guest_entitlements entitlement
JOIN guest_orders source_order ON source_order.id = entitlement.source_order_id
WHERE usage.location_id IS NULL
  AND usage.entitlement_id = entitlement.id
  AND source_order.location_id IS NOT NULL;

UPDATE guest_entitlement_usages usage
SET location_id = (
    SELECT location.id
    FROM guest_entitlements entitlement
    JOIN locations location ON location.company_id = entitlement.company_id
    WHERE entitlement.id = usage.entitlement_id
    ORDER BY location.default_location DESC, location.active DESC, location.name ASC, location.id ASC
    LIMIT 1
)
WHERE usage.location_id IS NULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM guest_entitlement_usages WHERE location_id IS NULL) THEN
        RAISE EXCEPTION 'Cannot make guest_entitlement_usages.location_id mandatory: one or more entitlement usages have no resolvable location';
    END IF;
END $$;

ALTER TABLE guest_entitlement_usages ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_entitlement_usages_location_used
    ON guest_entitlement_usages(location_id, used_at DESC, id DESC);

-- Join-table guardrails. A location allowlist may only contain locations belonging to the same company.
CREATE OR REPLACE FUNCTION validate_guest_product_location_scope()
RETURNS trigger AS $$
DECLARE
    product_company BIGINT;
    location_company BIGINT;
BEGIN
    SELECT company_id INTO product_company FROM guest_products WHERE id = NEW.product_id;
    SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
    IF product_company IS NULL OR location_company IS NULL OR product_company <> location_company THEN
        RAISE EXCEPTION 'Guest product location must belong to the same company' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_guest_product_location_scope ON guest_product_locations;
CREATE TRIGGER trg_validate_guest_product_location_scope
BEFORE INSERT OR UPDATE ON guest_product_locations
FOR EACH ROW EXECUTE FUNCTION validate_guest_product_location_scope();

CREATE OR REPLACE FUNCTION validate_payment_method_location_scope()
RETURNS trigger AS $$
DECLARE
    method_company BIGINT;
    location_company BIGINT;
BEGIN
    SELECT company_id INTO method_company FROM payment_methods WHERE id = NEW.payment_method_id;
    SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
    IF method_company IS NULL OR location_company IS NULL OR method_company <> location_company THEN
        RAISE EXCEPTION 'Payment method location must belong to the same company' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_payment_method_location_scope ON payment_method_locations;
CREATE TRIGGER trg_validate_payment_method_location_scope
BEFORE INSERT OR UPDATE ON payment_method_locations
FOR EACH ROW EXECUTE FUNCTION validate_payment_method_location_scope();

CREATE OR REPLACE FUNCTION validate_guest_entitlement_location_scope()
RETURNS trigger AS $$
DECLARE
    entitlement_company BIGINT;
    location_company BIGINT;
BEGIN
    SELECT company_id INTO entitlement_company FROM guest_entitlements WHERE id = NEW.entitlement_id;
    SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
    IF entitlement_company IS NULL OR location_company IS NULL OR entitlement_company <> location_company THEN
        RAISE EXCEPTION 'Guest entitlement location must belong to the same company' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_guest_entitlement_location_scope ON guest_entitlement_locations;
CREATE TRIGGER trg_validate_guest_entitlement_location_scope
BEFORE INSERT OR UPDATE ON guest_entitlement_locations
FOR EACH ROW EXECUTE FUNCTION validate_guest_entitlement_location_scope();

CREATE OR REPLACE FUNCTION validate_guest_entitlement_usage_location()
RETURNS trigger AS $$
DECLARE
    entitlement_company BIGINT;
    location_company BIGINT;
    booking_location BIGINT;
    service_booking_location BIGINT;
BEGIN
    SELECT company_id INTO entitlement_company FROM guest_entitlements WHERE id = NEW.entitlement_id;
    SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
    IF entitlement_company IS NULL OR location_company IS NULL OR entitlement_company <> location_company THEN
        RAISE EXCEPTION 'Guest entitlement usage location must belong to the same company as the entitlement' USING ERRCODE = '23514';
    END IF;

    IF NEW.session_booking_id IS NOT NULL THEN
        SELECT location_id INTO booking_location FROM session_booking WHERE id = NEW.session_booking_id;
        IF booking_location IS NULL OR booking_location <> NEW.location_id THEN
            RAISE EXCEPTION 'Guest entitlement usage location must match the linked booking location' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.session_service_id IS NOT NULL THEN
        SELECT booking.location_id INTO service_booking_location
        FROM session_service service
        JOIN session_booking booking ON booking.id = service.session_booking_id
        WHERE service.id = NEW.session_service_id;
        IF service_booking_location IS NULL OR service_booking_location <> NEW.location_id THEN
            RAISE EXCEPTION 'Guest entitlement usage location must match the linked service booking location' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_guest_entitlement_usage_location ON guest_entitlement_usages;
CREATE TRIGGER trg_validate_guest_entitlement_usage_location
BEFORE INSERT OR UPDATE ON guest_entitlement_usages
FOR EACH ROW EXECUTE FUNCTION validate_guest_entitlement_usage_location();
