-- Phase 2: shared client identities with non-destructive unit relationships.
-- Existing clients remain unit-owned. Every row initially receives its own workspace identity.

CREATE TABLE IF NOT EXISTS workspace_clients (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    public_id VARCHAR(36) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(255),
    normalized_email VARCHAR(255),
    normalized_phone VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    merged_into_id BIGINT,
    CONSTRAINT uq_workspace_client_public_id UNIQUE (public_id),
    CONSTRAINT ck_workspace_client_status CHECK (status IN ('ACTIVE', 'MERGED', 'ANONYMIZED')),
    CONSTRAINT fk_workspace_client_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT fk_workspace_client_merged_into FOREIGN KEY (merged_into_id) REFERENCES workspace_clients(id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_clients_workspace_name
    ON workspace_clients(workspace_id, lower(last_name), lower(first_name), id);
CREATE INDEX IF NOT EXISTS idx_workspace_clients_workspace_email
    ON workspace_clients(workspace_id, normalized_email) WHERE normalized_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_clients_workspace_phone
    ON workspace_clients(workspace_id, normalized_phone) WHERE normalized_phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_clients_id_workspace
    ON workspace_clients(id, workspace_id);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS workspace_client_id BIGINT;

-- Preserve client ids for the initial one-to-one migration. This makes support and rollback tracing straightforward.
INSERT INTO workspace_clients (
    id,
    created_at,
    updated_at,
    workspace_id,
    public_id,
    first_name,
    last_name,
    email,
    phone,
    normalized_email,
    normalized_phone,
    status
)
SELECT c.id,
       c.created_at,
       c.updated_at,
       company.workspace_id,
       substr(md5('workspace-client:' || c.id::text), 1, 8) || '-' ||
       substr(md5('workspace-client:' || c.id::text), 9, 4) || '-' ||
       substr(md5('workspace-client:' || c.id::text), 13, 4) || '-' ||
       substr(md5('workspace-client:' || c.id::text), 17, 4) || '-' ||
       substr(md5('workspace-client:' || c.id::text), 21, 12),
       c.first_name,
       c.last_name,
       nullif(lower(trim(c.email)), ''),
       nullif(trim(c.phone), ''),
       nullif(lower(trim(c.email)), ''),
       nullif(regexp_replace(coalesce(c.phone, ''), '[^0-9]', '', 'g'), ''),
       CASE WHEN c.anonymized THEN 'ANONYMIZED' ELSE 'ACTIVE' END
  FROM clients c
  JOIN company ON company.id = c.company_id
 WHERE NOT EXISTS (SELECT 1 FROM workspace_clients wc WHERE wc.id = c.id);

UPDATE clients SET workspace_client_id = id WHERE workspace_client_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_workspace_client') THEN
        ALTER TABLE clients
            ADD CONSTRAINT fk_clients_workspace_client
            FOREIGN KEY (workspace_client_id) REFERENCES workspace_clients(id);
    END IF;
END $$;

ALTER TABLE clients ALTER COLUMN workspace_client_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_workspace_client ON clients(workspace_client_id, company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_workspace_client_company
    ON clients(workspace_client_id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_id_company
    ON clients(id, company_id);

SELECT setval(
    pg_get_serial_sequence('workspace_clients', 'id'),
    COALESCE((SELECT MAX(id) FROM workspace_clients), 1),
    EXISTS (SELECT 1 FROM workspace_clients)
);

CREATE TABLE IF NOT EXISTS workspace_client_duplicate_candidates (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    left_workspace_client_id BIGINT NOT NULL,
    right_workspace_client_id BIGINT NOT NULL,
    score INTEGER NOT NULL,
    reasons_json TEXT NOT NULL DEFAULT '[]',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by_user_id BIGINT,
    CONSTRAINT uq_workspace_client_duplicate_pair UNIQUE (
        workspace_id, left_workspace_client_id, right_workspace_client_id
    ),
    CONSTRAINT ck_workspace_client_duplicate_order CHECK (left_workspace_client_id < right_workspace_client_id),
    CONSTRAINT ck_workspace_client_duplicate_score CHECK (score BETWEEN 0 AND 100),
    CONSTRAINT ck_workspace_client_duplicate_status CHECK (
        status IN ('PENDING', 'CONFIRMED_SAME_PERSON', 'NOT_DUPLICATE', 'DEFERRED', 'MERGED')
    ),
    CONSTRAINT fk_workspace_client_duplicate_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT fk_workspace_client_duplicate_left FOREIGN KEY (left_workspace_client_id) REFERENCES workspace_clients(id),
    CONSTRAINT fk_workspace_client_duplicate_right FOREIGN KEY (right_workspace_client_id) REFERENCES workspace_clients(id),
    CONSTRAINT fk_workspace_client_duplicate_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_client_duplicates_review
    ON workspace_client_duplicate_candidates(workspace_id, status, score DESC, created_at, id);

CREATE TABLE IF NOT EXISTS workspace_client_audit_log (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    actor_user_id BIGINT,
    actor_company_id BIGINT,
    action VARCHAR(48) NOT NULL,
    workspace_client_id BIGINT,
    related_workspace_client_id BIGINT,
    client_id BIGINT,
    details_json TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT fk_workspace_client_audit_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT fk_workspace_client_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_workspace_client_audit_actor_company FOREIGN KEY (actor_company_id) REFERENCES company(id) ON DELETE SET NULL,
    CONSTRAINT fk_workspace_client_audit_identity FOREIGN KEY (workspace_client_id) REFERENCES workspace_clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_workspace_client_audit_related_identity FOREIGN KEY (related_workspace_client_id) REFERENCES workspace_clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_workspace_client_audit_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_client_audit_identity
    ON workspace_client_audit_log(workspace_id, workspace_client_id, created_at DESC, id DESC);

-- Seed only strong cross-unit suggestions. No client relationships are merged automatically.
INSERT INTO workspace_client_duplicate_candidates (
    created_at,
    updated_at,
    workspace_id,
    left_workspace_client_id,
    right_workspace_client_id,
    score,
    reasons_json,
    status
)
SELECT now(),
       now(),
       left_wc.workspace_id,
       left_wc.id,
       right_wc.id,
       LEAST(
           100,
           (CASE WHEN left_wc.normalized_email IS NOT NULL
                       AND left_wc.normalized_email = right_wc.normalized_email THEN 60 ELSE 0 END) +
           (CASE WHEN left_wc.normalized_phone IS NOT NULL
                       AND left_wc.normalized_phone = right_wc.normalized_phone THEN 60 ELSE 0 END) +
           (CASE WHEN lower(trim(left_wc.first_name)) = lower(trim(right_wc.first_name))
                       AND lower(trim(left_wc.last_name)) = lower(trim(right_wc.last_name)) THEN 35 ELSE 0 END)
       ),
       to_json(ARRAY_REMOVE(ARRAY[
           CASE WHEN left_wc.normalized_email IS NOT NULL
                     AND left_wc.normalized_email = right_wc.normalized_email THEN 'SAME_EMAIL' END,
           CASE WHEN left_wc.normalized_phone IS NOT NULL
                     AND left_wc.normalized_phone = right_wc.normalized_phone THEN 'SAME_PHONE' END,
           CASE WHEN lower(trim(left_wc.first_name)) = lower(trim(right_wc.first_name))
                     AND lower(trim(left_wc.last_name)) = lower(trim(right_wc.last_name)) THEN 'SAME_NAME' END
       ], NULL))::text,
       'PENDING'
  FROM workspace_clients left_wc
  JOIN workspace_clients right_wc
    ON right_wc.workspace_id = left_wc.workspace_id
   AND right_wc.id > left_wc.id
   AND right_wc.status = 'ACTIVE'
  JOIN clients left_client ON left_client.workspace_client_id = left_wc.id
  JOIN clients right_client ON right_client.workspace_client_id = right_wc.id
 WHERE left_wc.status = 'ACTIVE'
   AND left_client.company_id <> right_client.company_id
   AND (
        (left_wc.normalized_email IS NOT NULL AND left_wc.normalized_email = right_wc.normalized_email)
        OR (left_wc.normalized_phone IS NOT NULL AND left_wc.normalized_phone = right_wc.normalized_phone)
   )
   AND LEAST(
           100,
           (CASE WHEN left_wc.normalized_email IS NOT NULL
                       AND left_wc.normalized_email = right_wc.normalized_email THEN 60 ELSE 0 END) +
           (CASE WHEN left_wc.normalized_phone IS NOT NULL
                       AND left_wc.normalized_phone = right_wc.normalized_phone THEN 60 ELSE 0 END) +
           (CASE WHEN lower(trim(left_wc.first_name)) = lower(trim(right_wc.first_name))
                       AND lower(trim(left_wc.last_name)) = lower(trim(right_wc.last_name)) THEN 35 ELSE 0 END)
       ) >= 70
ON CONFLICT (workspace_id, left_workspace_client_id, right_workspace_client_id) DO NOTHING;

-- New client rows created outside JPA still receive a workspace identity, and links cannot cross workspaces.
CREATE OR REPLACE FUNCTION calendra_ensure_workspace_client_link()
RETURNS trigger AS $$
DECLARE
    expected_workspace_id BIGINT;
    linked_workspace_id BIGINT;
    identity_seed TEXT;
BEGIN
    SELECT workspace_id INTO expected_workspace_id FROM company WHERE id = NEW.company_id;
    IF expected_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Cannot resolve workspace for company %', NEW.company_id;
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
            RAISE EXCEPTION 'Workspace client % does not exist', NEW.workspace_client_id;
        END IF;
        IF linked_workspace_id <> expected_workspace_id THEN
            RAISE EXCEPTION 'Workspace client % belongs to workspace %, not %',
                NEW.workspace_client_id, linked_workspace_id, expected_workspace_id;
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

DROP TRIGGER IF EXISTS trg_clients_ensure_workspace_client_link ON clients;
CREATE TRIGGER trg_clients_ensure_workspace_client_link
BEFORE INSERT OR UPDATE OF workspace_client_id, company_id ON clients
FOR EACH ROW EXECUTE FUNCTION calendra_ensure_workspace_client_link();

-- Shared contact identity is canonical. Anonymization is intentionally excluded so a unit can anonymize
-- its relationship without erasing the same person's identity in another unit.
CREATE OR REPLACE FUNCTION calendra_sync_workspace_client_identity()
RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() > 1 OR NEW.anonymized THEN
        RETURN NEW;
    END IF;

    UPDATE workspace_clients
       SET first_name = NEW.first_name,
           last_name = NEW.last_name,
           email = nullif(lower(trim(NEW.email)), ''),
           phone = nullif(trim(NEW.phone), ''),
           normalized_email = nullif(lower(trim(NEW.email)), ''),
           normalized_phone = nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g'), ''),
           updated_at = now()
     WHERE id = NEW.workspace_client_id
       AND status = 'ACTIVE';

    UPDATE clients
       SET first_name = NEW.first_name,
           last_name = NEW.last_name,
           email = nullif(lower(trim(NEW.email)), ''),
           phone = nullif(trim(NEW.phone), ''),
           whatsapp_phone = CASE
               WHEN whatsapp_phone IS NULL OR whatsapp_phone = '' OR whatsapp_phone = OLD.phone
               THEN nullif(trim(NEW.phone), '')
               ELSE whatsapp_phone
           END,
           updated_at = now()
     WHERE workspace_client_id = NEW.workspace_client_id
       AND id <> NEW.id
       AND anonymized = FALSE;

    -- This catches shared contact updates made outside the authenticated staff API as well.
    INSERT INTO workspace_client_audit_log (
        created_at, updated_at, workspace_id, actor_company_id, action,
        workspace_client_id, client_id, details_json
    )
    SELECT now(), now(), company.workspace_id, NEW.company_id, 'SHARED_IDENTITY_DATABASE_SYNC',
           NEW.workspace_client_id, NEW.id,
           json_build_object(
               'firstNameChanged', OLD.first_name IS DISTINCT FROM NEW.first_name,
               'lastNameChanged', OLD.last_name IS DISTINCT FROM NEW.last_name,
               'emailChanged', OLD.email IS DISTINCT FROM NEW.email,
               'phoneChanged', OLD.phone IS DISTINCT FROM NEW.phone
           )::text
      FROM company
     WHERE company.id = NEW.company_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_sync_workspace_client_identity ON clients;
CREATE TRIGGER trg_clients_sync_workspace_client_identity
AFTER UPDATE OF first_name, last_name, email, phone ON clients
FOR EACH ROW
WHEN (
    OLD.first_name IS DISTINCT FROM NEW.first_name OR
    OLD.last_name IS DISTINCT FROM NEW.last_name OR
    OLD.email IS DISTINCT FROM NEW.email OR
    OLD.phone IS DISTINCT FROM NEW.phone
)
EXECUTE FUNCTION calendra_sync_workspace_client_identity();

-- Files, inbox messages, internal notes, scheduled messages, bookings and invoices remain unit-only.
ALTER TABLE client_files ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'UNIT_ONLY';
ALTER TABLE client_messages ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'UNIT_ONLY';
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'UNIT_ONLY';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_client_files_visibility_scope') THEN
        ALTER TABLE client_files ADD CONSTRAINT ck_client_files_visibility_scope
            CHECK (visibility_scope = 'UNIT_ONLY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_client_messages_visibility_scope') THEN
        ALTER TABLE client_messages ADD CONSTRAINT ck_client_messages_visibility_scope
            CHECK (visibility_scope = 'UNIT_ONLY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_scheduled_messages_visibility_scope') THEN
        ALTER TABLE scheduled_messages ADD CONSTRAINT ck_scheduled_messages_visibility_scope
            CHECK (visibility_scope = 'UNIT_ONLY');
    END IF;

    -- NOT VALID preserves deployment even if historical data contains an old mismatch, while all new writes
    -- are checked immediately. Operations can validate these constraints after reviewing legacy rows.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_files_unit_client') THEN
        ALTER TABLE client_files ADD CONSTRAINT fk_client_files_unit_client
            FOREIGN KEY (client_id, owner_company_id) REFERENCES clients(id, company_id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_messages_unit_client') THEN
        ALTER TABLE client_messages ADD CONSTRAINT fk_client_messages_unit_client
            FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_scheduled_messages_unit_client') THEN
        ALTER TABLE scheduled_messages ADD CONSTRAINT fk_scheduled_messages_unit_client
            FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_unit_client') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_unit_client
            FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id) NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bills_unit_client') THEN
        ALTER TABLE bills ADD CONSTRAINT fk_bills_unit_client
            FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id) NOT VALID;
    END IF;
END $$;
