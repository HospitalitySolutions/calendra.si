-- Phase 7: complete the location-level public-presentation cutover.
-- V44 copied legacy company-level presentation into the default Location. From this
-- point forward those legacy settings are removed so they cannot become a second
-- source of truth again.

CREATE OR REPLACE FUNCTION calendra_phase7_try_jsonb(raw_value TEXT)
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

CREATE OR REPLACE FUNCTION calendra_phase7_sanitize_guest_app_settings(raw_value TEXT)
RETURNS TEXT AS $$
DECLARE
    payload JSONB;
BEGIN
    payload := calendra_phase7_try_jsonb(raw_value);

    IF jsonb_typeof(payload) <> 'object' THEN
        RETURN '{}';
    END IF;

    payload := payload
        - 'publicDiscoverable'
        - 'publicName'
        - 'publicAddress'
        - 'publicDescription'
        - 'publicPhone'
        - 'logoImageUrl';

    RETURN payload::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- V44 performed this preservation once. Repeat it defensively because a stale client
-- could have written logoImageUrl again after V44 but before the Phase 7 cutover.
WITH legacy_logos AS (
    SELECT
        company_id,
        left(NULLIF(btrim(calendra_phase7_try_jsonb(value) ->> 'logoImageUrl'), ''), 10000) AS logo_url
      FROM app_settings
     WHERE key = 'GUEST_APP_SETTINGS_JSON'
)
INSERT INTO app_settings (created_at, updated_at, company_id, key, value)
SELECT now(), now(), company_id, 'COMPANY_LOGO_URL', logo_url
  FROM legacy_logos
 WHERE logo_url IS NOT NULL
ON CONFLICT (company_id, key) DO UPDATE
   SET value = EXCLUDED.value,
       updated_at = now()
 WHERE btrim(COALESCE(app_settings.value, '')) = '';

UPDATE app_settings
   SET value = calendra_phase7_sanitize_guest_app_settings(value),
       updated_at = now()
 WHERE key = 'GUEST_APP_SETTINGS_JSON';

DELETE FROM app_settings
 WHERE key IN ('PUBLIC_DIRECTORY_ENABLED', 'GOOGLE_PLACE_ID');

DROP FUNCTION IF EXISTS calendra_phase7_sanitize_guest_app_settings(TEXT);
DROP FUNCTION IF EXISTS calendra_phase7_try_jsonb(TEXT);
