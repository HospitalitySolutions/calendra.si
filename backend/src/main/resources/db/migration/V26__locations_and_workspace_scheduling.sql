-- Phase 3: normalized physical locations and consolidated workspace scheduling.
-- Company remains the isolated operating unit. Space becomes a resource inside one location.

CREATE TABLE IF NOT EXISTS locations (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(512),
    postal_code VARCHAR(64),
    city VARCHAR(255),
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Ljubljana',
    phone VARCHAR(128),
    email VARCHAR(320),
    opening_hours_json TEXT,
    public_booking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    default_location BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    fiscal_business_premise_code VARCHAR(64),
    CONSTRAINT fk_location_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT uq_location_company_name UNIQUE (company_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_location_default_per_company
    ON locations(company_id) WHERE default_location = TRUE;
CREATE INDEX IF NOT EXISTS idx_location_company_active
    ON locations(company_id, active, default_location DESC, name, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_id_company ON locations(id, company_id);

INSERT INTO locations (
    id, created_at, updated_at, company_id, name, address, postal_code, city, timezone,
    phone, email, opening_hours_json, public_booking_enabled, default_location, active
)
SELECT c.id, c.created_at, c.updated_at, c.id, c.name,
       COALESCE(
           NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_PHYSICAL_ADDRESS'), ''),
           NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_ADDRESS'), '')
       ),
       COALESCE(
           NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_PHYSICAL_POSTAL_CODE'), ''),
           NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_POSTAL_CODE'), '')
       ),
       COALESCE(
           NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_PHYSICAL_CITY'), ''),
           NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_CITY'), '')
       ),
       'Europe/Ljubljana',
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_TELEPHONE'), ''),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_EMAIL'), ''),
       NULL, TRUE, TRUE, TRUE
  FROM company c
 WHERE NOT EXISTS (SELECT 1 FROM locations l WHERE l.company_id = c.id);

SELECT setval(
    pg_get_serial_sequence('locations', 'id'),
    COALESCE((SELECT MAX(id) FROM locations), 1),
    EXISTS (SELECT 1 FROM locations)
);

ALTER TABLE space ADD COLUMN IF NOT EXISTS location_id BIGINT;
UPDATE space s
   SET location_id = l.id
  FROM locations l
 WHERE l.company_id = s.company_id
   AND l.default_location = TRUE
   AND s.location_id IS NULL;

DO $$
DECLARE constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'space'
           AND c.contype = 'u'
           AND (
               SELECT array_agg(a.attname ORDER BY a.attname)
                 FROM unnest(c.conkey) key(attnum)
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
           ) = ARRAY['company_id', 'name']::TEXT[]
    LOOP
        EXECUTE format('ALTER TABLE space DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_space_location') THEN
        ALTER TABLE space ADD CONSTRAINT fk_space_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;

ALTER TABLE space ALTER COLUMN location_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_space_location_name ON space(location_id, name);
CREATE INDEX IF NOT EXISTS idx_space_location ON space(location_id, id);

ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS location_id BIGINT;
UPDATE session_booking sb
   SET location_id = COALESCE(
       (SELECT s.location_id FROM space s WHERE s.id = sb.space_id),
       (SELECT l.id FROM locations l WHERE l.company_id = sb.company_id AND l.default_location = TRUE)
   )
 WHERE sb.location_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_location') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE session_booking ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_booking_location_range ON session_booking(location_id, start_time, end_time, id);

-- waitlist_requests.location_id previously pointed to Space despite being presented as a location.
DO $$
DECLARE constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
          JOIN pg_class foreign_table ON foreign_table.oid = c.confrelid
         WHERE t.relname = 'waitlist_requests'
           AND foreign_table.relname = 'space'
           AND c.contype = 'f'
    LOOP
        EXECUTE format('ALTER TABLE waitlist_requests DROP CONSTRAINT %I', constraint_name);
    END LOOP;
END $$;

UPDATE waitlist_requests wr
   SET location_id = s.location_id
  FROM space s
 WHERE wr.location_id = s.id;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waitlist_request_location') THEN
        ALTER TABLE waitlist_requests
            ADD CONSTRAINT fk_waitlist_request_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_waitlist_request_location_status
    ON waitlist_requests(company_id, location_id, status, joined_at);

-- Raw SQL provisioning paths receive a default location as soon as a company is inserted.
CREATE OR REPLACE FUNCTION calendra_ensure_company_default_location()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM locations WHERE company_id = NEW.id) THEN
        INSERT INTO locations (
            created_at, updated_at, company_id, name, timezone,
            public_booking_enabled, default_location, active
        ) VALUES (
            COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()), NEW.id,
            COALESCE(NULLIF(trim(NEW.name), ''), 'Location'), 'Europe/Ljubljana', TRUE, TRUE, TRUE
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_ensure_default_location ON company;
CREATE TRIGGER trg_company_ensure_default_location
AFTER INSERT ON company
FOR EACH ROW EXECUTE FUNCTION calendra_ensure_company_default_location();

CREATE OR REPLACE FUNCTION calendra_validate_space_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        SELECT id INTO NEW.location_id FROM locations
         WHERE company_id = NEW.company_id AND default_location = TRUE
         ORDER BY id LIMIT 1;
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Space location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_space_validate_location ON space;
CREATE TRIGGER trg_space_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON space
FOR EACH ROW EXECUTE FUNCTION calendra_validate_space_location();

CREATE OR REPLACE FUNCTION calendra_validate_booking_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
    IF NEW.space_id IS NOT NULL THEN
        SELECT location_id INTO space_location_id FROM space
         WHERE id = NEW.space_id AND company_id = NEW.company_id;
        IF space_location_id IS NULL THEN
            RAISE EXCEPTION 'Booking space % does not belong to company %', NEW.space_id, NEW.company_id;
        END IF;
        IF NEW.location_id IS NULL THEN
            NEW.location_id := space_location_id;
        ELSIF NEW.location_id <> space_location_id THEN
            RAISE EXCEPTION 'Booking space % belongs to location %, not %', NEW.space_id, space_location_id, NEW.location_id;
        END IF;
    END IF;
    IF NEW.location_id IS NULL THEN
        SELECT id INTO NEW.location_id FROM locations
         WHERE company_id = NEW.company_id AND default_location = TRUE
         ORDER BY id LIMIT 1;
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Booking location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_booking_validate_location ON session_booking;
CREATE TRIGGER trg_session_booking_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, space_id ON session_booking
FOR EACH ROW EXECUTE FUNCTION calendra_validate_booking_location();

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Waitlist location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_waitlist_request_validate_location ON waitlist_requests;
CREATE TRIGGER trg_waitlist_request_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON waitlist_requests
FOR EACH ROW EXECUTE FUNCTION calendra_validate_waitlist_location();


CREATE OR REPLACE FUNCTION calendra_validate_session_service_location()
RETURNS trigger AS $$
DECLARE booking_company_id BIGINT;
DECLARE booking_location_id BIGINT;
DECLARE space_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
    IF NEW.space_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id, location_id INTO booking_company_id, booking_location_id
      FROM session_booking WHERE id = NEW.session_booking_id;
    SELECT company_id, location_id INTO space_company_id, space_location_id
      FROM space WHERE id = NEW.space_id;
    IF booking_company_id IS NULL OR space_company_id IS NULL
       OR booking_company_id <> space_company_id OR booking_location_id <> space_location_id THEN
        RAISE EXCEPTION 'Session service space % does not belong to booking location %', NEW.space_id, booking_location_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_service_validate_location ON session_service;
CREATE TRIGGER trg_session_service_validate_location
BEFORE INSERT OR UPDATE OF session_booking_id, space_id ON session_service
FOR EACH ROW EXECUTE FUNCTION calendra_validate_session_service_location();
