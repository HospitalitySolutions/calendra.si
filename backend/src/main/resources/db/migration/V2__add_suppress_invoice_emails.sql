-- Add per-recipient invoice email opt-out flag to clients and client companies.
-- When true, invoice emails are never sent to that client/company, overriding the
-- tenant-wide INVOICE_DELIVERY_EMAIL_ENABLED setting.

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS suppress_invoice_emails BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE client_companies
    ADD COLUMN IF NOT EXISTS suppress_invoice_emails BOOLEAN NOT NULL DEFAULT FALSE;
