-- Ensure ownership-validation triggers report PostgreSQL integrity SQLSTATEs.
-- Spring translates SQLSTATE class 23 into DataIntegrityViolationException.
-- This forward-only migration avoids changing checksums of already applied V25/V26 migrations.

CREATE OR REPLACE FUNCTION calendra_ensure_workspace_client_link()
RETURNS trigger AS $$
DECLARE
    expected_workspace_id BIGINT;
    linked_workspace_id BIGINT;
    identity_seed TEXT;
BEGIN
    SELECT workspace_id INTO expected_workspace_id FROM company WHERE id = NEW.company_id;
    IF expected_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Cannot resolve workspace for company %', NEW.company_id
            USING ERRCODE = '23503';
    END IF;

    IF NEW.workspace_client_id IS NULL THEN
        identity_seed := 'workspace-client-new:' || expected_workspace_id::text || ':' ||
                coalesce(NEW.id::text, clock_timestamp()::text || random()::text);
        INSERT INTO workspace_clients (
            created_at, updated_at, workspace_id, public_id, first_name, last_name,
            email, phone, normalized_email, normalized_phone, status
        ) VALUES (
            COALESCE(NEW.created_at, now()),
            COALESCE(NEW.updated_at, now()),
            expected_workspace_id,
            substr(md5(identity_seed), 1, 8) || '-' ||
            substr(md5(identity_seed), 9, 4) || '-' ||
            substr(md5(identity_seed), 13, 4) || '-' ||
            substr(md5(identity_seed), 17, 4) || '-' ||
            substr(md5(identity_seed), 21, 12),
            NEW.first_name,
            NEW.last_name,
            nullif(lower(trim(NEW.email)), ''),
            nullif(trim(NEW.phone), ''),
            nullif(lower(trim(NEW.email)), ''),
            nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g'), ''),
            CASE WHEN NEW.anonymized THEN 'ANONYMIZED' ELSE 'ACTIVE' END
        ) RETURNING id INTO NEW.workspace_client_id;

        INSERT INTO workspace_client_audit_log (
            created_at, updated_at, workspace_id, actor_company_id, action,
            workspace_client_id, client_id, details_json
        ) VALUES (
            now(), now(), expected_workspace_id, NEW.company_id, 'WORKSPACE_CLIENT_DATABASE_CREATED',
            NEW.workspace_client_id, null, json_build_object('rawClientId', NEW.id)::text
        );
    ELSE
        SELECT workspace_id INTO linked_workspace_id
          FROM workspace_clients
         WHERE id = NEW.workspace_client_id;
        IF linked_workspace_id IS NULL THEN
            RAISE EXCEPTION 'Workspace client % does not exist', NEW.workspace_client_id
                USING ERRCODE = '23503';
        END IF;
        IF linked_workspace_id <> expected_workspace_id THEN
            RAISE EXCEPTION 'Workspace client % belongs to workspace %, not %',
                NEW.workspace_client_id, linked_workspace_id, expected_workspace_id
                USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.workspace_client_id IS DISTINCT FROM NEW.workspace_client_id THEN
            INSERT INTO workspace_client_audit_log (
                created_at, updated_at, workspace_id, actor_company_id, action,
                workspace_client_id, related_workspace_client_id, client_id, details_json
            ) VALUES (
                now(), now(), expected_workspace_id, NEW.company_id, 'WORKSPACE_CLIENT_DATABASE_LINK_CHANGED',
                NEW.workspace_client_id, OLD.workspace_client_id, NEW.id,
                json_build_object('oldWorkspaceClientId', OLD.workspace_client_id,
                                  'newWorkspaceClientId', NEW.workspace_client_id)::text
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Waitlist location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
        RAISE EXCEPTION 'Session service space % does not belong to booking location %', NEW.space_id, booking_location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
