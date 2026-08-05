-- Each physical location owns its address/timezone and its default invoice counter.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'SI';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS default_invoice_series_id BIGINT;

-- Preserve an existing two-letter physical country where available; otherwise inherit
-- the mapped invoice issuer's country before falling back to Slovenia.
UPDATE locations l
   SET country = COALESCE(
           (SELECT UPPER(BTRIM(s.value))
              FROM app_settings s
             WHERE s.company_id = l.company_id
               AND s.key = 'COMPANY_PHYSICAL_COUNTRY'
               AND BTRIM(s.value) ~* '^[a-z]{2}$'
             LIMIT 1),
           (SELECT UPPER(BTRIM(le.country))
              FROM legal_entities le
             WHERE le.id = l.default_legal_entity_id
             LIMIT 1),
           'SI'
       );

-- Create a dedicated series for every existing location. Existing unit-wide series remain
-- available for historical invoices and explicit/manual selection.
INSERT INTO invoice_series (
    created_at, updated_at, workspace_id, legal_entity_id, company_id, location_id,
    name, next_number, initial_number, reset_policy, last_reset_year,
    business_premise_code, electronic_device_id, active
)
SELECT now(), now(), c.workspace_id,
       chosen_assignment.legal_entity_id,
       l.company_id, l.id,
       'Location-' || l.id,
       COALESCE(default_series.next_number,
                NULLIF((SELECT value FROM app_settings s WHERE s.company_id = l.company_id AND s.key = 'INVOICE_COUNTER'), ''),
                '1'),
       COALESCE(default_series.initial_number,
                NULLIF((SELECT value FROM app_settings s WHERE s.company_id = l.company_id AND s.key = 'INVOICE_COUNTER'), ''),
                '1'),
       COALESCE(default_series.reset_policy, 'NONE'),
       COALESCE(default_series.last_reset_year, EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER),
       l.fiscal_business_premise_code,
       COALESCE(default_series.electronic_device_id, '1'),
       TRUE
  FROM locations l
  JOIN company c ON c.id = l.company_id
  LEFT JOIN LATERAL (
       SELECT cle.legal_entity_id, cle.default_invoice_series_id
         FROM company_legal_entities cle
        WHERE cle.company_id = l.company_id
          AND cle.active = TRUE
          AND (cle.legal_entity_id = l.default_legal_entity_id OR cle.default_issuer = TRUE)
        ORDER BY (cle.legal_entity_id = l.default_legal_entity_id) DESC,
                 cle.default_issuer DESC,
                 cle.id ASC
        LIMIT 1
  ) chosen_assignment ON TRUE
  LEFT JOIN invoice_series default_series
    ON default_series.id = chosen_assignment.default_invoice_series_id
 WHERE chosen_assignment.legal_entity_id IS NOT NULL
   AND NOT EXISTS (
       SELECT 1
         FROM invoice_series existing
        WHERE existing.location_id = l.id
          AND existing.legal_entity_id = chosen_assignment.legal_entity_id
   );

UPDATE locations l
   SET default_invoice_series_id = (
           SELECT s.id
             FROM invoice_series s
            WHERE s.location_id = l.id
            ORDER BY (s.legal_entity_id = l.default_legal_entity_id) DESC, s.active DESC, s.id ASC
            LIMIT 1
       ),
       updated_at = now()
 WHERE l.default_invoice_series_id IS NULL
   AND EXISTS (
       SELECT 1
         FROM invoice_series s
        WHERE s.location_id = l.id
   );

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_location_default_invoice_series') THEN
        ALTER TABLE locations
            ADD CONSTRAINT fk_location_default_invoice_series
            FOREIGN KEY (default_invoice_series_id) REFERENCES invoice_series(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_locations_default_invoice_series
    ON locations(default_invoice_series_id);

-- Keep legacy consumers compatible while making the default location the single source
-- of truth for the operating unit's physical address.
INSERT INTO app_settings (created_at, updated_at, company_id, key, value)
SELECT now(), now(), l.company_id, address_setting.key, address_setting.value
  FROM locations l
 CROSS JOIN LATERAL (
       VALUES
           ('COMPANY_PHYSICAL_ADDRESS', COALESCE(l.address, '')),
           ('COMPANY_PHYSICAL_POSTAL_CODE', COALESCE(l.postal_code, '')),
           ('COMPANY_PHYSICAL_CITY', COALESCE(l.city, '')),
           ('COMPANY_PHYSICAL_COUNTRY', COALESCE(l.country, 'SI')),
           ('COMPANY_PHYSICAL_ADDRESS_SAME_AS_COMPANY', 'false')
 ) AS address_setting(key, value)
 WHERE l.default_location = TRUE
ON CONFLICT (company_id, key) DO UPDATE
    SET value = EXCLUDED.value,
        updated_at = now();
