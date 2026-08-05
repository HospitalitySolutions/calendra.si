-- Existing series without an electronic device identifier use device 1.
UPDATE invoice_series
SET electronic_device_id = '1'
WHERE electronic_device_id IS NULL OR BTRIM(electronic_device_id) = '';

ALTER TABLE invoice_series
    ALTER COLUMN electronic_device_id SET DEFAULT '1';

ALTER TABLE invoice_series
    ALTER COLUMN electronic_device_id SET NOT NULL;

-- Invoice prefixes are location-specific. Backfill the immutable bill snapshot
-- from the location that issued each invoice so historical PDFs use the same rule.
UPDATE bills AS bill
SET fiscal_business_premise_snapshot = COALESCE(
        NULLIF(BTRIM(location.fiscal_business_premise_code), ''),
        '1'
    )
FROM locations AS location
WHERE bill.location_id = location.id;

UPDATE bills
SET fiscal_device_id_snapshot = '1'
WHERE fiscal_device_id_snapshot IS NULL OR BTRIM(fiscal_device_id_snapshot) = '';
