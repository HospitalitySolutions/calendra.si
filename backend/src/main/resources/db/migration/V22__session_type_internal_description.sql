ALTER TABLE session_type
    ADD COLUMN IF NOT EXISTS internal_description VARCHAR(512);
