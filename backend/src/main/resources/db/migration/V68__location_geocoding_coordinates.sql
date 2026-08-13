ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geocode_source_address VARCHAR(1024),
    ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS geocode_last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS geocode_status VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_locations_public_geocoded
    ON locations (active, public_directory_enabled, geocoded_at)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;
