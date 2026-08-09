-- Phase 5.5B: location-own recurring availability and make consultant availability scope explicit.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS working_hours_by_location_json TEXT;

CREATE TABLE IF NOT EXISTS user_locations (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_user_locations_location_user
    ON user_locations(location_id, user_id);

-- Existing users were company-wide before this migration, therefore they retain all-location scope.
UPDATE users SET available_all_locations = TRUE WHERE available_all_locations IS NULL;

ALTER TABLE bookable_slot ADD COLUMN IF NOT EXISTS location_id BIGINT;
UPDATE bookable_slot bs
   SET location_id = l.id
  FROM locations l
 WHERE bs.location_id IS NULL
   AND l.company_id = bs.company_id
   AND l.default_location = TRUE;
-- Defensive fallback for development data that predates default-location hardening.
UPDATE bookable_slot bs
   SET location_id = (
       SELECT l.id
         FROM locations l
        WHERE l.company_id = bs.company_id
        ORDER BY l.active DESC, l.default_location DESC, l.id ASC
        LIMIT 1
   )
 WHERE bs.location_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bookable_slot_location') THEN
        ALTER TABLE bookable_slot
            ADD CONSTRAINT fk_bookable_slot_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE bookable_slot ALTER COLUMN location_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookable_slot_location_day_consultant_dates
    ON bookable_slot(location_id, day_of_week, consultant_id, start_date, end_date, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_bookable_slot_consultant_location_day_time
    ON bookable_slot(consultant_id, location_id, day_of_week, start_time, end_time);

-- Selected user/location assignments may only connect rows belonging to the same company.
CREATE OR REPLACE FUNCTION calendra_validate_user_location_scope()
RETURNS trigger AS $$
DECLARE user_company_id BIGINT;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id INTO user_company_id FROM users WHERE id = NEW.user_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF user_company_id IS NULL OR location_company_id IS NULL OR user_company_id <> location_company_id THEN
        RAISE EXCEPTION 'User % and location % must belong to the same company', NEW.user_id, NEW.location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_user_locations_validate_company ON user_locations;
CREATE TRIGGER trg_user_locations_validate_company
BEFORE INSERT OR UPDATE OF user_id, location_id ON user_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_user_location_scope();

-- Recurring bookable availability is branch-owned and the selected consultant must be eligible
-- for that branch. Company-wide consultants remain valid through available_all_locations=true.
CREATE OR REPLACE FUNCTION calendra_validate_bookable_slot_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
DECLARE consultant_company_id BIGINT;
DECLARE consultant_all_locations BOOLEAN;
DECLARE consultant_allowed BOOLEAN;
BEGIN
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    SELECT company_id, available_all_locations
      INTO consultant_company_id, consultant_all_locations
      FROM users WHERE id = NEW.consultant_id;

    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Bookable slot location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF consultant_company_id IS NULL OR consultant_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Bookable slot consultant % does not belong to company %', NEW.consultant_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NOT COALESCE(consultant_all_locations, TRUE) THEN
        SELECT EXISTS(
            SELECT 1 FROM user_locations ul
             WHERE ul.user_id = NEW.consultant_id
               AND ul.location_id = NEW.location_id
        ) INTO consultant_allowed;
        IF NOT consultant_allowed THEN
            RAISE EXCEPTION 'Consultant % is not assigned to location %', NEW.consultant_id, NEW.location_id
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_bookable_slot_validate_location ON bookable_slot;
CREATE TRIGGER trg_bookable_slot_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, consultant_id ON bookable_slot
FOR EACH ROW EXECUTE FUNCTION calendra_validate_bookable_slot_location();
