-- Location-level public identity foundation.
-- Public-facing presentation now belongs to a physical location rather than the legal company.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_name VARCHAR(255);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_address VARCHAR(512);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_description VARCHAR(500);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_logo_s3_key VARCHAR(1024);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_directory_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS guest_app_discoverable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS website_presentation_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_locations_public_directory
    ON locations(public_directory_enabled, active, company_id, id)
    WHERE public_directory_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_locations_guest_app_discoverable
    ON locations(guest_app_discoverable, active, company_id, id)
    WHERE guest_app_discoverable = TRUE;

-- Existing development/staging data can contain malformed or empty JSON.  Keep the
-- migration resilient and copy only values that can be parsed safely.
CREATE OR REPLACE FUNCTION calendra_try_jsonb(raw_value TEXT)
RETURNS JSONB AS $$
BEGIN
    IF raw_value IS NULL OR btrim(raw_value) = '' THEN
        RETURN '{}'::jsonb;
    END IF;
    RETURN raw_value::jsonb;
EXCEPTION WHEN others THEN
    RETURN '{}'::jsonb;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

WITH legacy AS (
    SELECT
        l.id AS location_id,
        calendra_try_jsonb((
            SELECT s.value
              FROM app_settings s
             WHERE s.company_id = l.company_id
               AND s.key = 'GUEST_APP_SETTINGS_JSON'
             ORDER BY s.id DESC
             LIMIT 1
        )) AS guest_json,
        (
            SELECT s.value
              FROM app_settings s
             WHERE s.company_id = l.company_id
               AND s.key = 'PUBLIC_DIRECTORY_ENABLED'
             ORDER BY s.id DESC
             LIMIT 1
        ) AS directory_enabled,
        (
            SELECT s.value
              FROM app_settings s
             WHERE s.company_id = l.company_id
               AND s.key = 'GOOGLE_PLACE_ID'
             ORDER BY s.id DESC
             LIMIT 1
        ) AS google_place_id
      FROM locations l
     WHERE l.default_location = TRUE
)
UPDATE locations l
   SET public_name = COALESCE(left(NULLIF(btrim(legacy.guest_json ->> 'publicName'), ''), 255), l.public_name),
       public_address = COALESCE(left(NULLIF(btrim(legacy.guest_json ->> 'publicAddress'), ''), 512), l.public_address),
       public_description = COALESCE(left(NULLIF(btrim(legacy.guest_json ->> 'publicDescription'), ''), 500), l.public_description),
       phone = COALESCE(left(NULLIF(btrim(legacy.guest_json ->> 'publicPhone'), ''), 128), l.phone),
       guest_app_discoverable = CASE
           WHEN lower(COALESCE(legacy.guest_json ->> 'publicDiscoverable', 'false')) = 'true' THEN TRUE
           ELSE l.guest_app_discoverable
       END,
       public_directory_enabled = CASE
           WHEN lower(COALESCE(btrim(legacy.directory_enabled), 'false')) = 'true' THEN TRUE
           ELSE l.public_directory_enabled
       END,
       google_place_id = COALESCE(left(NULLIF(btrim(legacy.google_place_id), ''), 255), l.google_place_id)
  FROM legacy
 WHERE l.id = legacy.location_id;

-- COMPANY_LOGO_URL is the canonical company-level fallback. Older Guest App data
-- could still keep the only logo in GUEST_APP_SETTINGS_JSON.logoImageUrl, so preserve
-- it once when the canonical setting is currently absent or blank.
WITH legacy_logos AS (
    SELECT
        c.id AS company_id,
        left(NULLIF(btrim(calendra_try_jsonb((
            SELECT s.value
              FROM app_settings s
             WHERE s.company_id = c.id
               AND s.key = 'GUEST_APP_SETTINGS_JSON'
             ORDER BY s.id DESC
             LIMIT 1
        )) ->> 'logoImageUrl'), ''), 10000) AS logo_url
      FROM company c
)
INSERT INTO app_settings (created_at, updated_at, company_id, key, value)
SELECT now(), now(), company_id, 'COMPANY_LOGO_URL', logo_url
  FROM legacy_logos
 WHERE logo_url IS NOT NULL
ON CONFLICT (company_id, key) DO UPDATE
   SET value = EXCLUDED.value,
       updated_at = now()
 WHERE btrim(COALESCE(app_settings.value, '')) = '';

DROP FUNCTION IF EXISTS calendra_try_jsonb(TEXT);

-- Keep raw-SQL provisioning safe.  New columns use their database defaults; this
-- replacement simply keeps the function in sync with the current locations table.
CREATE OR REPLACE FUNCTION calendra_ensure_company_default_location()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM locations WHERE company_id = NEW.id) THEN
        INSERT INTO locations (
            created_at, updated_at, company_id, name, timezone,
            public_booking_enabled, default_location, active,
            public_directory_enabled, guest_app_discoverable, website_presentation_enabled
        ) VALUES (
            COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()), NEW.id,
            COALESCE(NULLIF(trim(NEW.name), ''), 'Location'), 'Europe/Ljubljana',
            TRUE, TRUE, TRUE, FALSE, FALSE, TRUE
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
