ALTER TABLE bill_item
    ADD COLUMN IF NOT EXISTS original_gross_price NUMERIC(12, 2);

-- Existing invoices cannot reliably reconstruct their original pre-discount
-- amount, so preserve their current printed value as the fallback baseline.
UPDATE bill_item
SET original_gross_price = gross_price
WHERE original_gross_price IS NULL;
