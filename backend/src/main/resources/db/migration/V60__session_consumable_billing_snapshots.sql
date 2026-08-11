-- Phase: billable session consumables -> open bill / invoice lines.
-- Keep historical pricing and VAT stable even when the consumable catalogue changes later.
ALTER TABLE consumable
    ADD COLUMN IF NOT EXISTS vat_rate VARCHAR(32) NOT NULL DEFAULT 'NO_VAT';

ALTER TABLE session_consumable
    ADD COLUMN IF NOT EXISTS item_name_snapshot VARCHAR(160),
    ADD COLUMN IF NOT EXISTS vat_rate_snapshot VARCHAR(32) NOT NULL DEFAULT 'NO_VAT';

UPDATE session_consumable sc
SET item_name_snapshot = c.name
FROM consumable c
WHERE sc.consumable_id = c.id
  AND (sc.item_name_snapshot IS NULL OR BTRIM(sc.item_name_snapshot) = '');

ALTER TABLE session_consumable
    ALTER COLUMN item_name_snapshot SET NOT NULL;

-- Open-bill lines keep a stable source pointer so repeated appointment saves are idempotent.
ALTER TABLE open_bill_items
    ADD COLUMN IF NOT EXISTS source_session_consumable_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_open_bill_items_source_session_consumable
    ON open_bill_items(source_session_consumable_id, open_bill_id);

-- Preserve the source on the immutable invoice line for audit/debugging.
ALTER TABLE bill_item
    ADD COLUMN IF NOT EXISTS source_session_consumable_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_bill_item_source_session_consumable
    ON bill_item(source_session_consumable_id, bill_id);

-- Billing still requires a TransactionService for VAT/tax reporting. Consumables use hidden,
-- system-generated carrier services (one per VAT rate per tenant); the actual article name and
-- price are always taken from the session snapshot / invoice_line_description.
ALTER TABLE transaction_service
    ADD COLUMN IF NOT EXISTS system_generated BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS system_source VARCHAR(32),
    ADD COLUMN IF NOT EXISTS system_source_key VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_service_system_source
    ON transaction_service(company_id, system_source, system_source_key)
    WHERE system_generated = TRUE
      AND system_source IS NOT NULL
      AND system_source_key IS NOT NULL;
