-- Normalize the electronic device identifier at the database boundary. This is
-- deliberately a trigger, rather than only a column default, because legacy
-- provisioning functions explicitly insert NULL and would otherwise bypass the
-- default value.
CREATE OR REPLACE FUNCTION calendra_default_invoice_series_device()
RETURNS trigger AS $$
BEGIN
    IF NEW.electronic_device_id IS NULL OR BTRIM(NEW.electronic_device_id) = '' THEN
        NEW.electronic_device_id := '1';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_series_default_device ON invoice_series;
CREATE TRIGGER trg_invoice_series_default_device
BEFORE INSERT OR UPDATE ON invoice_series
FOR EACH ROW EXECUTE FUNCTION calendra_default_invoice_series_device();

-- Existing series without an electronic device identifier use device 1.
UPDATE invoice_series
SET electronic_device_id = '1'
WHERE electronic_device_id IS NULL OR BTRIM(electronic_device_id) = '';

ALTER TABLE invoice_series
    ALTER COLUMN electronic_device_id SET DEFAULT '1';

ALTER TABLE invoice_series
    ALTER COLUMN electronic_device_id SET NOT NULL;

-- Invoice prefixes are location-specific. Only fill missing immutable snapshots;
-- never replace an identity that was already captured when the invoice was issued.
-- The issuer trigger normally blocks every snapshot update, so suspend it only for
-- this one-time backfill and immediately restore it afterwards.
ALTER TABLE bills DISABLE TRIGGER trg_prepare_bill_issuer;

UPDATE bills AS bill
SET fiscal_business_premise_snapshot = COALESCE(
        NULLIF(BTRIM(location.fiscal_business_premise_code), ''),
        '1'
    )
FROM locations AS location
WHERE bill.location_id = location.id
  AND (
      bill.fiscal_business_premise_snapshot IS NULL
      OR BTRIM(bill.fiscal_business_premise_snapshot) = ''
  );

UPDATE bills
SET fiscal_device_id_snapshot = '1'
WHERE fiscal_device_id_snapshot IS NULL OR BTRIM(fiscal_device_id_snapshot) = '';

ALTER TABLE bills ENABLE TRIGGER trg_prepare_bill_issuer;
