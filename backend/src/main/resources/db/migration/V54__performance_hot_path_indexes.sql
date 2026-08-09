-- Phase 6 performance hardening: indexes for the hot reads introduced by runtime diagnostics
-- and batched calendar pricing. These are additive/idempotent and do not change application data.

CREATE INDEX IF NOT EXISTS idx_app_settings_key_updated_id
    ON app_settings (key, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_session_type_location_prices_company_location_type_tx
    ON session_type_location_prices (company_id, location_id, session_type_id, transaction_service_id);
