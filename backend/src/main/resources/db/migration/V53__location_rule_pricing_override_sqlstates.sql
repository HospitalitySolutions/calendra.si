-- Normalize tenant/location validation failures to SQLSTATE class 23 so Spring
-- translates them as data-integrity violations rather than uncategorized SQL errors.

CREATE OR REPLACE FUNCTION calendra_validate_location_setting_override()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations l
        WHERE l.id = NEW.location_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION calendra_validate_session_type_location_price()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations l
        WHERE l.id = NEW.location_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM session_type st
        WHERE st.id = NEW.session_type_id AND st.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Session type % does not belong to company %', NEW.session_type_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM transaction_service ts
        WHERE ts.id = NEW.transaction_service_id AND ts.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Transaction service % does not belong to company %', NEW.transaction_service_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM type_transaction_services tts
        WHERE tts.session_type_id = NEW.session_type_id
          AND tts.transaction_service_id = NEW.transaction_service_id
    ) THEN
        RAISE EXCEPTION 'Transaction service % is not linked to session type %', NEW.transaction_service_id, NEW.session_type_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;
