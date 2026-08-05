CREATE TABLE workspace_service_templates (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id),
    owner_company_id BIGINT NOT NULL REFERENCES company(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    default_duration_minutes INTEGER,
    color VARCHAR(20),
    icon VARCHAR(80),
    booking_instructions TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE session_type
    ADD COLUMN workspace_service_template_id BIGINT;

ALTER TABLE session_type
    ADD COLUMN available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE session_type_locations (
    session_type_id BIGINT NOT NULL REFERENCES session_type(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (session_type_id, location_id)
);

CREATE INDEX idx_session_type_locations_location
    ON session_type_locations(location_id, session_type_id);

CREATE OR REPLACE FUNCTION calendra_validate_session_type_location()
RETURNS trigger AS $$
DECLARE
    service_company_id BIGINT;
    location_company_id BIGINT;
BEGIN
    SELECT company_id INTO service_company_id FROM session_type WHERE id = NEW.session_type_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF service_company_id IS NULL OR location_company_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Service or location does not exist';
    END IF;
    IF service_company_id <> location_company_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Service location belongs to another operating unit';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_session_type_location
BEFORE INSERT OR UPDATE OF session_type_id, location_id ON session_type_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_session_type_location();

ALTER TABLE session_type
    ADD CONSTRAINT fk_session_type_workspace_service_template
    FOREIGN KEY (workspace_service_template_id)
    REFERENCES workspace_service_templates(id)
    NOT VALID;

DO $$
DECLARE
    row_record RECORD;
    template_id BIGINT;
BEGIN
    FOR row_record IN
        SELECT st.id, st.company_id, st.description, st.name, st.duration_minutes, st.color, c.workspace_id
          FROM session_type st
          JOIN company c ON c.id = st.company_id
         WHERE st.workspace_service_template_id IS NULL
         ORDER BY st.id
    LOOP
        INSERT INTO workspace_service_templates (
            workspace_id, owner_company_id, name, description, default_duration_minutes, color, active, created_at, updated_at
        ) VALUES (
            row_record.workspace_id,
            row_record.company_id,
            COALESCE(NULLIF(BTRIM(row_record.description), ''), row_record.name, 'Service'),
            row_record.description,
            row_record.duration_minutes,
            row_record.color,
            TRUE,
            NOW(),
            NOW()
        )
        RETURNING id INTO template_id;

        UPDATE session_type
           SET workspace_service_template_id = template_id
         WHERE id = row_record.id;
    END LOOP;
END $$;

ALTER TABLE session_type
    VALIDATE CONSTRAINT fk_session_type_workspace_service_template;

CREATE OR REPLACE FUNCTION calendra_validate_session_type_workspace_template()
RETURNS trigger AS $$
DECLARE
    unit_workspace_id BIGINT;
    template_workspace_id BIGINT;
    created_template_id BIGINT;
BEGIN
    SELECT workspace_id INTO unit_workspace_id FROM company WHERE id = NEW.company_id;
    IF unit_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Session type company does not exist';
    END IF;

    IF NEW.workspace_service_template_id IS NULL THEN
        INSERT INTO workspace_service_templates (
            workspace_id, owner_company_id, name, description, default_duration_minutes, color, active, created_at, updated_at
        ) VALUES (
            unit_workspace_id,
            NEW.company_id,
            COALESCE(NULLIF(BTRIM(NEW.description), ''), NEW.name, 'Service'),
            NEW.description,
            NEW.duration_minutes,
            NEW.color,
            TRUE,
            NOW(),
            NOW()
        ) RETURNING id INTO created_template_id;
        NEW.workspace_service_template_id := created_template_id;
        RETURN NEW;
    END IF;

    SELECT workspace_id INTO template_workspace_id
      FROM workspace_service_templates
     WHERE id = NEW.workspace_service_template_id;

    IF template_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Workspace service template does not exist';
    END IF;
    IF template_workspace_id <> unit_workspace_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace service template belongs to another workspace';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_workspace_service_template_owner()
RETURNS trigger AS $$
DECLARE
    owner_workspace_id BIGINT;
BEGIN
    SELECT workspace_id INTO owner_workspace_id FROM company WHERE id = NEW.owner_company_id;
    IF owner_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Workspace service owner unit does not exist';
    END IF;
    IF owner_workspace_id <> NEW.workspace_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace service owner belongs to another workspace';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_workspace_service_template_owner ON workspace_service_templates;
CREATE TRIGGER trg_validate_workspace_service_template_owner
BEFORE INSERT OR UPDATE OF workspace_id, owner_company_id ON workspace_service_templates
FOR EACH ROW EXECUTE FUNCTION calendra_validate_workspace_service_template_owner();

DROP TRIGGER IF EXISTS trg_validate_session_type_workspace_template ON session_type;
CREATE TRIGGER trg_validate_session_type_workspace_template
BEFORE INSERT OR UPDATE OF company_id, workspace_service_template_id ON session_type
FOR EACH ROW EXECUTE FUNCTION calendra_validate_session_type_workspace_template();

CREATE INDEX idx_session_type_workspace_service_template
    ON session_type(workspace_service_template_id);

CREATE UNIQUE INDEX uq_session_type_company_workspace_template
    ON session_type(company_id, workspace_service_template_id)
    WHERE workspace_service_template_id IS NOT NULL;

CREATE TABLE workspace_service_audit_log (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id),
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    actor_company_id BIGINT REFERENCES company(id) ON DELETE SET NULL,
    workspace_service_template_id BIGINT REFERENCES workspace_service_templates(id) ON DELETE SET NULL,
    session_type_id BIGINT REFERENCES session_type(id) ON DELETE SET NULL,
    action VARCHAR(48) NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_service_audit_workspace_created
    ON workspace_service_audit_log(workspace_id, created_at DESC);

CREATE TABLE configuration_copy_audit_log (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id),
    source_company_id BIGINT NOT NULL REFERENCES company(id),
    target_company_id BIGINT NOT NULL REFERENCES company(id),
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    categories_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_configuration_copy_audit_workspace_created
    ON configuration_copy_audit_log(workspace_id, created_at DESC);
