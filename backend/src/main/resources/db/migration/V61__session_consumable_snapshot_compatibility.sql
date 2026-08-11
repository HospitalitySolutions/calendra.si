-- Preserve compatibility with legacy/direct session_consumable inserts while keeping
-- billing snapshots non-null and historically stable.
--
-- V60 made item_name_snapshot NOT NULL. Some integration tests and maintenance SQL
-- intentionally insert session_consumable rows using the pre-billing column set.
-- Populate the missing snapshot from the referenced consumable before the NOT NULL
-- constraint is checked instead of weakening the snapshot constraint.

CREATE OR REPLACE FUNCTION fill_session_consumable_billing_snapshots()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    catalogue_name VARCHAR(160);
    catalogue_sale_price NUMERIC(19,4);
    catalogue_vat_rate VARCHAR(32);
BEGIN
    IF NEW.item_name_snapshot IS NULL
       OR BTRIM(NEW.item_name_snapshot) = ''
       OR NEW.sale_price_snapshot IS NULL
       OR NEW.vat_rate_snapshot IS NULL
       OR BTRIM(NEW.vat_rate_snapshot) = '' THEN
        SELECT c.name, c.sale_price, c.vat_rate
          INTO catalogue_name, catalogue_sale_price, catalogue_vat_rate
          FROM consumable c
         WHERE c.id = NEW.consumable_id
           AND c.company_id = NEW.company_id;
    END IF;

    IF NEW.item_name_snapshot IS NULL OR BTRIM(NEW.item_name_snapshot) = '' THEN
        NEW.item_name_snapshot := COALESCE(NULLIF(BTRIM(catalogue_name), ''), 'Porabni material');
    END IF;

    IF NEW.sale_price_snapshot IS NULL THEN
        NEW.sale_price_snapshot := catalogue_sale_price;
    END IF;

    IF NEW.vat_rate_snapshot IS NULL OR BTRIM(NEW.vat_rate_snapshot) = '' THEN
        NEW.vat_rate_snapshot := COALESCE(NULLIF(BTRIM(catalogue_vat_rate), ''), 'NO_VAT');
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_fill_session_consumable_billing_snapshots
    ON session_consumable;

CREATE TRIGGER trg_fill_session_consumable_billing_snapshots
BEFORE INSERT OR UPDATE OF consumable_id, company_id, item_name_snapshot, sale_price_snapshot, vat_rate_snapshot
ON session_consumable
FOR EACH ROW
EXECUTE FUNCTION fill_session_consumable_billing_snapshots();
