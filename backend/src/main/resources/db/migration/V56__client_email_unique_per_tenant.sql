-- Email is the tenant-local identity key for clients/guests.
--
-- Historical databases may already contain duplicate emails from older public-booking
-- behaviour. We deliberately do not merge or delete those rows in a schema migration,
-- because they can own bookings, invoices, messages and guest-wallet history.
-- Instead this trigger prevents every new duplicate (including concurrent writers) while
-- allowing legacy duplicate rows to remain editable until they are reviewed/merged safely.

CREATE OR REPLACE FUNCTION enforce_client_email_unique_per_tenant()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
    normalized_email text;
    old_normalized_email text;
BEGIN
    -- Internal company/proxy billing clients are not guest/person identities and may
    -- legitimately share a finance contact email. The tenant uniqueness rule applies to
    -- PERSON clients (the rows shown as guests/clients in the normal directory).
    IF NEW.invoice_recipient_type IS DISTINCT FROM 'PERSON' THEN
        RETURN NEW;
    END IF;

    normalized_email := NULLIF(lower(trim(NEW.email)), '');
    IF normalized_email IS NULL THEN
        RETURN NEW;
    END IF;

    -- Do not make unrelated edits to a legacy duplicate impossible. Hibernate can include
    -- email/company_id in UPDATE statements even when their normalized value did not change.
    IF TG_OP = 'UPDATE' THEN
        old_normalized_email := NULLIF(lower(trim(OLD.email)), '');
        IF NEW.company_id IS NOT DISTINCT FROM OLD.company_id
           AND NEW.invoice_recipient_type IS NOT DISTINCT FROM OLD.invoice_recipient_type
           AND normalized_email IS NOT DISTINCT FROM old_normalized_email THEN
            RETURN NEW;
        END IF;
    END IF;

    -- Serialize writers for this exact tenant/email key so two concurrent public requests
    -- cannot both pass the existence check and insert duplicate rows.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('clients-email|' || NEW.company_id::text || '|' || normalized_email, 0)
    );

    IF EXISTS (
        SELECT 1
          FROM clients existing
         WHERE existing.company_id = NEW.company_id
           AND existing.id IS DISTINCT FROM NEW.id
           AND existing.email IS NOT NULL
           AND trim(existing.email) <> ''
           AND lower(trim(existing.email)) = normalized_email
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '23505',
            CONSTRAINT = 'uq_clients_company_normalized_email',
            MESSAGE = 'duplicate client email for tenant';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clients_unique_email_per_tenant ON clients;
CREATE TRIGGER trg_clients_unique_email_per_tenant
BEFORE INSERT OR UPDATE OF company_id, email, invoice_recipient_type ON clients
FOR EACH ROW
EXECUTE FUNCTION enforce_client_email_unique_per_tenant();

-- On a clean database, also install a conventional unique index as an additional guard and
-- faster declarative constraint. If legacy duplicates exist, the trigger above remains the
-- authoritative guard until those records are reviewed rather than destructively rewritten.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_indexes
         WHERE schemaname = 'public'
           AND indexname = 'uq_clients_company_normalized_email'
    )
    AND NOT EXISTS (
        SELECT 1
          FROM clients
         WHERE invoice_recipient_type = 'PERSON'
           AND email IS NOT NULL AND trim(email) <> ''
         GROUP BY company_id, lower(trim(email))
        HAVING count(*) > 1
    ) THEN
        CREATE UNIQUE INDEX uq_clients_company_normalized_email
            ON clients (company_id, lower(trim(email)))
            WHERE invoice_recipient_type = 'PERSON'
              AND email IS NOT NULL AND trim(email) <> '';
    END IF;
END $$;
