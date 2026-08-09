-- Phase 5.5A: make concrete operational records location-owned.
-- Workspace remains the shared account boundary, Company remains the legal/operating entity,
-- and Location is the mandatory branch for bookings, waitlist activity and draft billing.

-- Open bills already receive a location in V33; make the invariant explicit at schema level.
UPDATE open_bills ob
   SET location_id = l.id
  FROM locations l
 WHERE ob.location_id IS NULL
   AND l.company_id = ob.company_id
   AND l.default_location = TRUE;
ALTER TABLE open_bills ALTER COLUMN location_id SET NOT NULL;

-- Every waitlist request must target one physical branch. Existing development rows are
-- resolved from their concrete booking where possible and otherwise from the default branch.
UPDATE waitlist_requests wr
   SET location_id = sb.location_id
  FROM session_booking sb
 WHERE wr.location_id IS NULL
   AND wr.target_session_id = sb.id
   AND sb.location_id IS NOT NULL;
UPDATE waitlist_requests wr
   SET location_id = l.id
  FROM locations l
 WHERE wr.location_id IS NULL
   AND l.company_id = wr.company_id
   AND l.default_location = TRUE;
ALTER TABLE waitlist_requests ALTER COLUMN location_id SET NOT NULL;

-- Persist the branch directly on an offer. It is immutable operational context and should
-- not have to be reconstructed through waitlist_request joins later.
ALTER TABLE waitlist_offers ADD COLUMN IF NOT EXISTS location_id BIGINT;
UPDATE waitlist_offers wo
   SET location_id = wr.location_id
  FROM waitlist_requests wr
 WHERE wo.location_id IS NULL
   AND wo.waitlist_request_id = wr.id;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waitlist_offer_location') THEN
        ALTER TABLE waitlist_offers
            ADD CONSTRAINT fk_waitlist_offer_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE waitlist_offers ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waitlist_offer_location_status_expiry
    ON waitlist_offers(location_id, status, expires_at);

-- A waitlist reservation hold belongs to exactly the same branch as its offer.
ALTER TABLE waitlist_booking_holds ADD COLUMN IF NOT EXISTS location_id BIGINT;
UPDATE waitlist_booking_holds wh
   SET location_id = wo.location_id
  FROM waitlist_offers wo
 WHERE wh.location_id IS NULL
   AND wh.offer_id = wo.id;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waitlist_hold_location') THEN
        ALTER TABLE waitlist_booking_holds
            ADD CONSTRAINT fk_waitlist_hold_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE waitlist_booking_holds ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waitlist_hold_location_active_slot
    ON waitlist_booking_holds(location_id, status, slot_start, slot_end);

-- Public booking holds must also carry the selected branch. Group holds can be recovered from
-- the concrete group session; legacy non-group development rows fall back to the default branch.
ALTER TABLE booking_slot_holds ADD COLUMN IF NOT EXISTS location_id BIGINT;
UPDATE booking_slot_holds bh
   SET location_id = sb.location_id
  FROM session_booking sb
 WHERE bh.location_id IS NULL
   AND bh.group_session_id = sb.id
   AND sb.location_id IS NOT NULL;
UPDATE booking_slot_holds bh
   SET location_id = l.id
  FROM locations l
 WHERE bh.location_id IS NULL
   AND l.company_id = bh.company_id
   AND l.default_location = TRUE;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_slot_hold_location') THEN
        ALTER TABLE booking_slot_holds
            ADD CONSTRAINT fk_booking_slot_hold_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE booking_slot_holds ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_slot_holds_location_window
    ON booking_slot_holds(location_id, expires_at, slot_start, busy_end);

-- Guest orders already store the selected branch in metadata for booking orders. Normalize it
-- into a relation now. It remains nullable until Phase 5.5C makes non-booking purchases location-scoped.
ALTER TABLE guest_orders ADD COLUMN IF NOT EXISTS location_id BIGINT;
-- Metadata is the authoritative source for Phase 5 booking orders that have not produced a bill/booking yet.
-- Use a regex rather than a JSON cast so one malformed legacy metadata payload cannot block the migration.
WITH parsed_order_locations AS (
    SELECT id, company_id,
           ((regexp_match(metadata_json, '"locationId"\s*:\s*"?([0-9]+)"?'))[1])::BIGINT AS parsed_location_id
      FROM guest_orders
     WHERE location_id IS NULL
       AND metadata_json IS NOT NULL
       AND metadata_json ~ '"locationId"\s*:\s*"?[0-9]+"?'
)
UPDATE guest_orders go
   SET location_id = parsed.parsed_location_id
  FROM parsed_order_locations parsed
  JOIN locations l
    ON l.id = parsed.parsed_location_id
   AND l.company_id = parsed.company_id
 WHERE go.id = parsed.id;
UPDATE guest_orders go
   SET location_id = b.location_id
  FROM bills b
 WHERE go.location_id IS NULL
   AND go.bill_id = b.id
   AND b.location_id IS NOT NULL;
UPDATE guest_orders go
   SET location_id = sb.location_id
  FROM session_booking sb
 WHERE go.location_id IS NULL
   AND sb.company_id = go.company_id
   AND sb.source_order_id = go.id::text
   AND sb.location_id IS NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_order_location') THEN
        ALTER TABLE guest_orders
            ADD CONSTRAINT fk_guest_order_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_guest_orders_company_location_created
    ON guest_orders(company_id, location_id, created_at DESC);

-- Cross-company/location guardrails. These mirror existing booking/open-bill validation and
-- prevent a caller from persisting a location owned by another operating unit.
CREATE OR REPLACE FUNCTION calendra_validate_booking_slot_hold_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
DECLARE group_location_id BIGINT;
BEGIN
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Booking hold location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NEW.group_session_id IS NOT NULL THEN
        SELECT location_id INTO group_location_id FROM session_booking
         WHERE id = NEW.group_session_id AND company_id = NEW.company_id;
        IF group_location_id IS NULL OR group_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Booking hold group session % belongs to another location', NEW.group_session_id
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_booking_slot_hold_validate_location ON booking_slot_holds;
CREATE TRIGGER trg_booking_slot_hold_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, group_session_id ON booking_slot_holds
FOR EACH ROW EXECUTE FUNCTION calendra_validate_booking_slot_hold_location();

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_offer_location()
RETURNS trigger AS $$
DECLARE request_company_id BIGINT;
DECLARE request_location_id BIGINT;
DECLARE room_location_id BIGINT;
DECLARE session_location_id BIGINT;
BEGIN
    SELECT company_id, location_id INTO request_company_id, request_location_id
      FROM waitlist_requests WHERE id = NEW.waitlist_request_id;
    IF request_company_id IS NULL OR request_company_id <> NEW.company_id OR request_location_id <> NEW.location_id THEN
        RAISE EXCEPTION 'Waitlist offer location must match its request location'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.room_id IS NOT NULL THEN
        SELECT location_id INTO room_location_id FROM space WHERE id = NEW.room_id AND company_id = NEW.company_id;
        IF room_location_id IS NULL OR room_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Waitlist offer room belongs to another location' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.session_id IS NOT NULL THEN
        SELECT location_id INTO session_location_id FROM session_booking WHERE id = NEW.session_id AND company_id = NEW.company_id;
        IF session_location_id IS NULL OR session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Waitlist offer session belongs to another location' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_waitlist_offer_validate_location ON waitlist_offers;
CREATE TRIGGER trg_waitlist_offer_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, waitlist_request_id, room_id, session_id ON waitlist_offers
FOR EACH ROW EXECUTE FUNCTION calendra_validate_waitlist_offer_location();

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_hold_location()
RETURNS trigger AS $$
DECLARE offer_company_id BIGINT;
DECLARE offer_location_id BIGINT;
DECLARE room_location_id BIGINT;
DECLARE session_location_id BIGINT;
BEGIN
    SELECT company_id, location_id INTO offer_company_id, offer_location_id
      FROM waitlist_offers WHERE id = NEW.offer_id;
    IF offer_company_id IS NULL OR offer_company_id <> NEW.company_id OR offer_location_id <> NEW.location_id THEN
        RAISE EXCEPTION 'Waitlist hold location must match its offer location'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.room_id IS NOT NULL THEN
        SELECT location_id INTO room_location_id FROM space WHERE id = NEW.room_id AND company_id = NEW.company_id;
        IF room_location_id IS NULL OR room_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Waitlist hold room belongs to another location' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.session_id IS NOT NULL THEN
        SELECT location_id INTO session_location_id FROM session_booking WHERE id = NEW.session_id AND company_id = NEW.company_id;
        IF session_location_id IS NULL OR session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Waitlist hold session belongs to another location' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_waitlist_hold_validate_location ON waitlist_booking_holds;
CREATE TRIGGER trg_waitlist_hold_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, offer_id, room_id, session_id ON waitlist_booking_holds
FOR EACH ROW EXECUTE FUNCTION calendra_validate_waitlist_hold_location();

CREATE OR REPLACE FUNCTION calendra_validate_guest_order_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Guest order location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_guest_order_validate_location ON guest_orders;
CREATE TRIGGER trg_guest_order_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON guest_orders
FOR EACH ROW EXECUTE FUNCTION calendra_validate_guest_order_location();

-- Remove the remaining database-level "default branch" escape hatch for concrete operational
-- rows. Older triggers silently assigned the default location whenever location_id was omitted,
-- which is unsafe once a company has several branches. Omitted location is allowed only when
-- exactly one active branch exists; multi-location raw writers must provide location_id.
CREATE OR REPLACE FUNCTION calendra_single_active_location_id(p_company_id BIGINT)
RETURNS BIGINT AS $$
DECLARE resolved_id BIGINT;
DECLARE active_count INTEGER;
BEGIN
    SELECT COUNT(*), MIN(id) INTO active_count, resolved_id
      FROM locations
     WHERE company_id = p_company_id
       AND active = TRUE;
    IF active_count = 0 THEN
        RAISE EXCEPTION 'Company % has no active location', p_company_id USING ERRCODE = '23514';
    END IF;
    IF active_count > 1 THEN
        RAISE EXCEPTION 'Location selection is required for company %', p_company_id USING ERRCODE = '23514';
    END IF;
    RETURN resolved_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_space_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        NEW.location_id := calendra_single_active_location_id(NEW.company_id);
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Space location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_booking_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
    -- Preserve the V38 guard: attendee/status/billing-only updates must not be interpreted as moves.
    IF TG_OP = 'UPDATE'
       AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
       AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
       AND NEW.space_id IS NOT DISTINCT FROM OLD.space_id THEN
        RETURN NEW;
    END IF;

    IF NEW.space_id IS NOT NULL THEN
        SELECT location_id INTO space_location_id FROM space
         WHERE id = NEW.space_id AND company_id = NEW.company_id;
        IF space_location_id IS NULL THEN
            RAISE EXCEPTION 'Booking space % does not belong to company %', NEW.space_id, NEW.company_id
                USING ERRCODE = '23514';
        END IF;
        IF NEW.location_id IS NULL THEN
            NEW.location_id := space_location_id;
        ELSIF NEW.location_id <> space_location_id THEN
            RAISE EXCEPTION 'Booking space % belongs to location %, not %', NEW.space_id, space_location_id, NEW.location_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.location_id IS NULL THEN
        NEW.location_id := calendra_single_active_location_id(NEW.company_id);
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Booking location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_open_bill_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        NEW.location_id := calendra_single_active_location_id(NEW.company_id);
    END IF;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Open bill location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        NEW.location_id := calendra_single_active_location_id(NEW.company_id);
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Waitlist location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
