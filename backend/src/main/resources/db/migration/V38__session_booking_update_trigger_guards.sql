-- Unrelated SessionBooking updates (for example cancelling/removing one group participant)
-- must not be treated as a new/moved booking by subscription/location integrity triggers.
-- Hibernate historically generated full-row UPDATE statements, so PostgreSQL UPDATE OF triggers
-- could fire even when company/start/location/space values were unchanged.

CREATE OR REPLACE FUNCTION calendra_validate_booking_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
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
        SELECT id INTO NEW.location_id FROM locations
         WHERE company_id = NEW.company_id AND default_location = TRUE
         ORDER BY id LIMIT 1;
    END IF;

    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Booking location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_booking_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_bookings INTEGER; overage_allowed BOOLEAN; current_bookings BIGINT;
BEGIN
    -- UPDATE OF company_id/start_time fires when those columns are present in the SQL SET list,
    -- even if their values did not actually change. Do not re-apply the monthly creation limit
    -- to an attendee/status/billing-only update.
    IF TG_OP = 'UPDATE'
       AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
       AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time THEN
        RETURN NEW;
    END IF;

    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_monthly_bookings, allow_booking_overage
      INTO allowed_bookings, overage_allowed
      FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_bookings IS NULL OR allowed_bookings = 0 OR COALESCE(overage_allowed, TRUE) THEN RETURN NEW; END IF;

    SELECT COUNT(*) INTO current_bookings
      FROM session_booking sb
      JOIN company c ON c.id = sb.company_id
     WHERE c.workspace_id = target_workspace
       AND sb.start_time >= date_trunc('month', NEW.start_time)
       AND sb.start_time < date_trunc('month', NEW.start_time) + interval '1 month'
       AND (TG_OP = 'INSERT' OR sb.id <> NEW.id);
    IF current_bookings + 1 > allowed_bookings THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace monthly booking limit reached';
    END IF;
    RETURN NEW;
END $$;
