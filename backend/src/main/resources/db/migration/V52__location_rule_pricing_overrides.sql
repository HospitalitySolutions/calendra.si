-- Phase 5.5E: company defaults with optional per-location operational overrides.

CREATE TABLE location_setting_overrides (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    setting_key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_location_setting_override UNIQUE (company_id, location_id, setting_key)
);

CREATE INDEX idx_location_setting_overrides_company_location
    ON location_setting_overrides(company_id, location_id);

CREATE TABLE session_type_location_prices (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    session_type_id BIGINT NOT NULL REFERENCES session_type(id) ON DELETE CASCADE,
    transaction_service_id BIGINT NOT NULL REFERENCES transaction_service(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    price NUMERIC(12,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_session_type_location_price UNIQUE (session_type_id, transaction_service_id, location_id)
);

CREATE INDEX idx_session_type_location_prices_company_location
    ON session_type_location_prices(company_id, location_id);
CREATE INDEX idx_session_type_location_prices_type_location
    ON session_type_location_prices(session_type_id, location_id);

CREATE OR REPLACE FUNCTION calendra_validate_location_setting_override()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations l
        WHERE l.id = NEW.location_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_location_setting_override_company
BEFORE INSERT OR UPDATE ON location_setting_overrides
FOR EACH ROW EXECUTE FUNCTION calendra_validate_location_setting_override();

CREATE OR REPLACE FUNCTION calendra_validate_session_type_location_price()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations l
        WHERE l.id = NEW.location_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM session_type st
        WHERE st.id = NEW.session_type_id AND st.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Session type % does not belong to company %', NEW.session_type_id, NEW.company_id;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM transaction_service ts
        WHERE ts.id = NEW.transaction_service_id AND ts.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Transaction service % does not belong to company %', NEW.transaction_service_id, NEW.company_id;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM type_transaction_services tts
        WHERE tts.session_type_id = NEW.session_type_id
          AND tts.transaction_service_id = NEW.transaction_service_id
    ) THEN
        RAISE EXCEPTION 'Transaction service % is not linked to session type %', NEW.transaction_service_id, NEW.session_type_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_session_type_location_price_company
BEFORE INSERT OR UPDATE ON session_type_location_prices
FOR EACH ROW EXECUTE FUNCTION calendra_validate_session_type_location_price();
