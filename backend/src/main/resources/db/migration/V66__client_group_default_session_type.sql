ALTER TABLE client_groups
    ADD COLUMN IF NOT EXISTS default_session_type_id BIGINT;

ALTER TABLE client_groups
    DROP CONSTRAINT IF EXISTS fk_client_groups_default_session_type;

ALTER TABLE client_groups
    ADD CONSTRAINT fk_client_groups_default_session_type
        FOREIGN KEY (default_session_type_id)
        REFERENCES session_type(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_groups_default_session_type
    ON client_groups(default_session_type_id);
