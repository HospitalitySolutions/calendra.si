-- Phase 4: workspace legal entities, assignable invoice issuers and normalized invoice series.
-- Existing Company rows remain operating/security units. Existing bills keep their numbers and
-- receive immutable issuer/series/location snapshots without being renumbered.

CREATE TABLE IF NOT EXISTS legal_entities (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(512),
    postal_code VARCHAR(64),
    city VARCHAR(255),
    country VARCHAR(2) NOT NULL DEFAULT 'SI',
    tax_number VARCHAR(64),
    vat_id VARCHAR(64),
    iban VARCHAR(128),
    bic VARCHAR(64),
    email VARCHAR(320),
    telephone VARCHAR(128),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    fiscal_environment VARCHAR(16) NOT NULL DEFAULT 'TEST',
    software_supplier_tax_number VARCHAR(64),
    certificate_password_encrypted TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_legal_entity_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT ck_legal_entity_country CHECK (char_length(country) = 2),
    CONSTRAINT ck_legal_entity_currency CHECK (char_length(currency) = 3),
    CONSTRAINT ck_legal_entity_fiscal_environment CHECK (fiscal_environment IN ('TEST', 'PROD'))
);
CREATE INDEX IF NOT EXISTS idx_legal_entity_workspace_active
    ON legal_entities(workspace_id, active, name, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_entities_id_workspace ON legal_entities(id, workspace_id);

INSERT INTO legal_entities (
    id, created_at, updated_at, workspace_id, name, address, postal_code, city, country,
    tax_number, vat_id, iban, bic, email, telephone, currency, fiscal_environment,
    software_supplier_tax_number, certificate_password_encrypted, active
)
SELECT c.id,
       c.created_at,
       c.updated_at,
       c.workspace_id,
       c.name,
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_ADDRESS'), ''),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_POSTAL_CODE'), ''),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_CITY'), ''),
       'SI',
       COALESCE(
           NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'FISCAL_TAX_NUMBER'), ''),
           regexp_replace(COALESCE(NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_VAT_ID'), ''), ''), '^SI', '', 'i')
       ),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_VAT_ID'), ''),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_IBAN'), ''),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_BIC'), ''),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_EMAIL'), ''),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'COMPANY_TELEPHONE'), ''),
       'EUR',
       CASE WHEN upper(COALESCE((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'FISCAL_ENVIRONMENT'), 'TEST')) = 'PROD' THEN 'PROD' ELSE 'TEST' END,
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER'), ''),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'FISCAL_CERTIFICATE_PASSWORD'), ''),
       TRUE
  FROM company c
 WHERE NOT EXISTS (SELECT 1 FROM legal_entities le WHERE le.id = c.id);

SELECT setval(
    pg_get_serial_sequence('legal_entities', 'id'),
    COALESCE((SELECT MAX(id) FROM legal_entities), 1),
    EXISTS (SELECT 1 FROM legal_entities)
);

CREATE TABLE IF NOT EXISTS company_legal_entities (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    legal_entity_id BIGINT NOT NULL,
    default_issuer BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    default_invoice_series_id BIGINT,
    CONSTRAINT fk_company_legal_entity_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_company_legal_entity_legal FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
    CONSTRAINT uq_company_legal_entity UNIQUE (company_id, legal_entity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_default_legal_entity
    ON company_legal_entities(company_id) WHERE default_issuer = TRUE AND active = TRUE;
CREATE INDEX IF NOT EXISTS idx_company_legal_entity_lookup
    ON company_legal_entities(company_id, active, default_issuer DESC, legal_entity_id);

INSERT INTO company_legal_entities (
    created_at, updated_at, company_id, legal_entity_id, default_issuer, active
)
SELECT now(), now(), c.id, c.id, TRUE, TRUE
  FROM company c
 WHERE NOT EXISTS (
       SELECT 1 FROM company_legal_entities cle WHERE cle.company_id = c.id AND cle.legal_entity_id = c.id
 );

CREATE TABLE IF NOT EXISTS invoice_series (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    legal_entity_id BIGINT NOT NULL,
    company_id BIGINT,
    location_id BIGINT,
    name VARCHAR(255) NOT NULL,
    next_number VARCHAR(255) NOT NULL,
    initial_number VARCHAR(255) NOT NULL DEFAULT '1',
    reset_policy VARCHAR(16) NOT NULL DEFAULT 'NONE',
    last_reset_year INTEGER,
    business_premise_code VARCHAR(64),
    electronic_device_id VARCHAR(64),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_invoice_series_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT fk_invoice_series_legal_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
    CONSTRAINT fk_invoice_series_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_invoice_series_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT uq_invoice_series_legal_name UNIQUE (legal_entity_id, name),
    CONSTRAINT ck_invoice_series_reset_policy CHECK (reset_policy IN ('NONE', 'YEARLY')),
    CONSTRAINT ck_invoice_series_location_scope CHECK (location_id IS NULL OR company_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_invoice_series_legal_active
    ON invoice_series(legal_entity_id, active, company_id, location_id, name, id);
CREATE INDEX IF NOT EXISTS idx_invoice_series_company_active
    ON invoice_series(company_id, active, location_id, id);

INSERT INTO invoice_series (
    id, created_at, updated_at, workspace_id, legal_entity_id, company_id, location_id,
    name, next_number, initial_number, reset_policy, last_reset_year,
    business_premise_code, electronic_device_id, active
)
SELECT c.id,
       c.created_at,
       c.updated_at,
       c.workspace_id,
       c.id,
       c.id,
       NULL,
       'Default',
       COALESCE(NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'INVOICE_COUNTER'), ''), '1'),
       COALESCE(NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'INVOICE_COUNTER'), ''), '1'),
       'NONE',
       EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
       COALESCE(
           NULLIF((SELECT fiscal_business_premise_code FROM locations l WHERE l.company_id = c.id AND l.default_location = TRUE LIMIT 1), ''),
           NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'FISCAL_BUSINESS_PREMISE_ID'), '')
       ),
       NULLIF((SELECT value FROM app_settings s WHERE s.company_id = c.id AND s.key = 'FISCAL_DEVICE_ID'), ''),
       TRUE
  FROM company c
 WHERE NOT EXISTS (SELECT 1 FROM invoice_series series WHERE series.id = c.id);

SELECT setval(
    pg_get_serial_sequence('invoice_series', 'id'),
    COALESCE((SELECT MAX(id) FROM invoice_series), 1),
    EXISTS (SELECT 1 FROM invoice_series)
);

UPDATE company_legal_entities cle
   SET default_invoice_series_id = series.id,
       updated_at = now()
  FROM invoice_series series
 WHERE series.company_id = cle.company_id
   AND series.legal_entity_id = cle.legal_entity_id
   AND cle.default_invoice_series_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_company_legal_entity_default_series') THEN
        ALTER TABLE company_legal_entities
            ADD CONSTRAINT fk_company_legal_entity_default_series
            FOREIGN KEY (default_invoice_series_id) REFERENCES invoice_series(id);
    END IF;
END $$;

ALTER TABLE locations ADD COLUMN IF NOT EXISTS default_legal_entity_id BIGINT;
UPDATE locations l
   SET default_legal_entity_id = cle.legal_entity_id
  FROM company_legal_entities cle
 WHERE cle.company_id = l.company_id
   AND cle.default_issuer = TRUE
   AND cle.active = TRUE
   AND l.default_legal_entity_id IS NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_location_default_legal_entity') THEN
        ALTER TABLE locations
            ADD CONSTRAINT fk_location_default_legal_entity
            FOREIGN KEY (default_legal_entity_id) REFERENCES legal_entities(id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_location_default_legal_entity ON locations(default_legal_entity_id, company_id);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS legal_entity_id BIGINT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS invoice_series_id BIGINT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS location_id BIGINT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_name_snapshot VARCHAR(255);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_address_snapshot VARCHAR(512);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_postal_code_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_city_snapshot VARCHAR(255);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_country_snapshot VARCHAR(2);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_tax_number_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_vat_id_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_iban_snapshot VARCHAR(128);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_bic_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_email_snapshot VARCHAR(320);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_telephone_snapshot VARCHAR(128);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS invoice_series_name_snapshot VARCHAR(255);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS fiscal_business_premise_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS fiscal_device_id_snapshot VARCHAR(64);

UPDATE bills b
   SET legal_entity_id = cle.legal_entity_id,
       invoice_series_id = cle.default_invoice_series_id
  FROM company_legal_entities cle
 WHERE cle.company_id = b.company_id
   AND cle.default_issuer = TRUE
   AND cle.active = TRUE
   AND (b.legal_entity_id IS NULL OR b.invoice_series_id IS NULL);

UPDATE bills b
   SET location_id = COALESCE(
       (SELECT sb.location_id FROM session_booking sb WHERE sb.id = b.source_session_id_snapshot),
       (SELECT l.id FROM locations l WHERE l.company_id = b.company_id AND l.default_location = TRUE LIMIT 1)
   )
 WHERE b.location_id IS NULL;

UPDATE bills b
   SET issuer_name_snapshot = COALESCE(b.issuer_name_snapshot, le.name),
       issuer_address_snapshot = COALESCE(b.issuer_address_snapshot, le.address),
       issuer_postal_code_snapshot = COALESCE(b.issuer_postal_code_snapshot, le.postal_code),
       issuer_city_snapshot = COALESCE(b.issuer_city_snapshot, le.city),
       issuer_country_snapshot = COALESCE(b.issuer_country_snapshot, le.country),
       issuer_tax_number_snapshot = COALESCE(b.issuer_tax_number_snapshot, le.tax_number),
       issuer_vat_id_snapshot = COALESCE(b.issuer_vat_id_snapshot, le.vat_id),
       issuer_iban_snapshot = COALESCE(b.issuer_iban_snapshot, le.iban),
       issuer_bic_snapshot = COALESCE(b.issuer_bic_snapshot, le.bic),
       issuer_email_snapshot = COALESCE(b.issuer_email_snapshot, le.email),
       issuer_telephone_snapshot = COALESCE(b.issuer_telephone_snapshot, le.telephone),
       invoice_series_name_snapshot = COALESCE(b.invoice_series_name_snapshot, series.name),
       fiscal_business_premise_snapshot = COALESCE(b.fiscal_business_premise_snapshot, series.business_premise_code),
       fiscal_device_id_snapshot = COALESCE(b.fiscal_device_id_snapshot, series.electronic_device_id)
  FROM legal_entities le, invoice_series series
 WHERE le.id = b.legal_entity_id
   AND series.id = b.invoice_series_id;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bill_legal_entity') THEN
        ALTER TABLE bills ADD CONSTRAINT fk_bill_legal_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bill_invoice_series') THEN
        ALTER TABLE bills ADD CONSTRAINT fk_bill_invoice_series FOREIGN KEY (invoice_series_id) REFERENCES invoice_series(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bill_location') THEN
        ALTER TABLE bills ADD CONSTRAINT fk_bill_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;

ALTER TABLE bills ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN invoice_series_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN issuer_name_snapshot SET NOT NULL;
ALTER TABLE bills ALTER COLUMN invoice_series_name_snapshot SET NOT NULL;
DROP INDEX IF EXISTS ux_bills_company_bill_number;
CREATE UNIQUE INDEX IF NOT EXISTS ux_bills_invoice_series_bill_number
    ON bills(invoice_series_id, bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_workspace_issuer_history
    ON bills(legal_entity_id, issue_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_bills_invoice_series_history
    ON bills(invoice_series_id, issue_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_bills_location_history
    ON bills(location_id, issue_date DESC, id DESC);

ALTER TABLE fiscal_certificates ADD COLUMN IF NOT EXISTS legal_entity_id BIGINT;
UPDATE fiscal_certificates fc
   SET legal_entity_id = cle.legal_entity_id
  FROM company_legal_entities cle
 WHERE cle.company_id = fc.company_id
   AND cle.default_issuer = TRUE
   AND cle.active = TRUE
   AND fc.legal_entity_id IS NULL;

DO $$
DECLARE constraint_name TEXT;
BEGIN
    FOR constraint_name IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_class t ON t.oid = c.conrelid
         WHERE t.relname = 'fiscal_certificates'
           AND c.contype = 'u'
           AND (
               SELECT array_agg(a.attname::TEXT ORDER BY a.attname::TEXT)
                 FROM unnest(c.conkey) key(attnum)
                 JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = key.attnum
           ) = ARRAY['company_id']::TEXT[]
    LOOP
        EXECUTE format('ALTER TABLE fiscal_certificates DROP CONSTRAINT %I', constraint_name);
    END LOOP;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_fiscal_certificate_legal_entity') THEN
        ALTER TABLE fiscal_certificates
            ADD CONSTRAINT fk_fiscal_certificate_legal_entity
            FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id);
    END IF;
END $$;
ALTER TABLE fiscal_certificates ALTER COLUMN legal_entity_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_certificate_legal_entity ON fiscal_certificates(legal_entity_id);

CREATE OR REPLACE FUNCTION calendra_validate_invoice_series_scope()
RETURNS trigger AS $$
DECLARE
    legal_workspace BIGINT;
    company_workspace BIGINT;
    location_company BIGINT;
BEGIN
    SELECT workspace_id INTO legal_workspace FROM legal_entities WHERE id = NEW.legal_entity_id;
    IF legal_workspace IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = format('Legal entity %s does not exist', NEW.legal_entity_id);
    END IF;
    IF legal_workspace <> NEW.workspace_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format('Invoice series workspace %s does not match legal entity workspace %s', NEW.workspace_id, legal_workspace);
    END IF;
    IF NEW.company_id IS NOT NULL THEN
        SELECT workspace_id INTO company_workspace FROM company WHERE id = NEW.company_id;
        IF company_workspace IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = format('Company %s does not exist', NEW.company_id);
        END IF;
        IF company_workspace <> NEW.workspace_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series company belongs to another workspace';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM company_legal_entities cle
             WHERE cle.company_id = NEW.company_id
               AND cle.legal_entity_id = NEW.legal_entity_id
               AND cle.active = TRUE
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series legal entity is not assigned to its company';
        END IF;
    END IF;
    IF NEW.location_id IS NOT NULL THEN
        SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
        IF location_company IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = format('Location %s does not exist', NEW.location_id);
        END IF;
        IF NEW.company_id IS NULL OR location_company <> NEW.company_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Location-specific invoice series must belong to the same company';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM company_legal_entities cle WHERE cle.default_invoice_series_id = NEW.id) THEN
        IF NEW.active IS NOT TRUE THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A default invoice series must remain active';
        END IF;
        IF NEW.location_id IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A unit-wide default invoice series cannot be location-specific';
        END IF;
        IF NEW.company_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM company_legal_entities cle
             WHERE cle.default_invoice_series_id = NEW.id
               AND cle.company_id <> NEW.company_id
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A shared default invoice series cannot be reassigned to one operating unit';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_invoice_series_scope ON invoice_series;
CREATE TRIGGER trg_invoice_series_scope
BEFORE INSERT OR UPDATE OF workspace_id, legal_entity_id, company_id, location_id, active
ON invoice_series FOR EACH ROW EXECUTE FUNCTION calendra_validate_invoice_series_scope();

CREATE OR REPLACE FUNCTION calendra_validate_company_legal_entity_assignment()
RETURNS trigger AS $$
DECLARE
    company_workspace BIGINT;
    legal_workspace BIGINT;
    legal_active BOOLEAN;
    series_legal BIGINT;
    series_company BIGINT;
    series_location BIGINT;
    series_active BOOLEAN;
BEGIN
    SELECT workspace_id INTO company_workspace FROM company WHERE id = NEW.company_id;
    SELECT workspace_id, active INTO legal_workspace, legal_active FROM legal_entities WHERE id = NEW.legal_entity_id;
    IF company_workspace IS NULL OR legal_workspace IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Company or legal entity does not exist';
    END IF;
    IF company_workspace <> legal_workspace THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A legal entity can only be assigned inside its workspace';
    END IF;
    IF NEW.active IS TRUE AND legal_active IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An inactive legal entity cannot have an active operating-unit assignment';
    END IF;
    IF NEW.default_issuer IS TRUE AND NEW.active IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The default issuer assignment must remain active';
    END IF;
    IF NEW.active IS NOT TRUE AND EXISTS (
        SELECT 1 FROM locations l
         WHERE l.company_id = NEW.company_id
           AND l.default_legal_entity_id = NEW.legal_entity_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Change location default issuers before deactivating this assignment';
    END IF;
    IF NEW.default_invoice_series_id IS NOT NULL THEN
        SELECT legal_entity_id, company_id, location_id, active
          INTO series_legal, series_company, series_location, series_active
          FROM invoice_series WHERE id = NEW.default_invoice_series_id;
        IF series_legal IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Default invoice series does not exist';
        END IF;
        IF series_legal <> NEW.legal_entity_id OR (series_company IS NOT NULL AND series_company <> NEW.company_id) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Default invoice series is not valid for this company and legal entity';
        END IF;
        IF series_active IS NOT TRUE THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Default invoice series must be active';
        END IF;
        IF series_location IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A unit-wide default invoice series cannot be location-specific';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_company_legal_entity_assignment ON company_legal_entities;
CREATE TRIGGER trg_company_legal_entity_assignment
BEFORE INSERT OR UPDATE OF company_id, legal_entity_id, default_invoice_series_id, default_issuer, active
ON company_legal_entities FOR EACH ROW EXECUTE FUNCTION calendra_validate_company_legal_entity_assignment();

CREATE OR REPLACE FUNCTION calendra_prevent_location_issuer_assignment_delete()
RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM locations l
         WHERE l.company_id = OLD.company_id
           AND l.default_legal_entity_id = OLD.legal_entity_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Change location default issuers before removing this assignment';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_company_legal_entity_delete ON company_legal_entities;
CREATE TRIGGER trg_company_legal_entity_delete
BEFORE DELETE ON company_legal_entities
FOR EACH ROW EXECUTE FUNCTION calendra_prevent_location_issuer_assignment_delete();

CREATE OR REPLACE FUNCTION calendra_validate_legal_entity_activation()
RETURNS trigger AS $$
BEGIN
    IF NEW.active IS NOT TRUE AND OLD.active IS TRUE AND EXISTS (
        SELECT 1 FROM company_legal_entities cle
         WHERE cle.legal_entity_id = NEW.id AND cle.active = TRUE
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Deactivate all operating-unit issuer assignments before deactivating the legal entity';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_legal_entity_activation ON legal_entities;
CREATE TRIGGER trg_legal_entity_activation
BEFORE UPDATE OF active ON legal_entities
FOR EACH ROW EXECUTE FUNCTION calendra_validate_legal_entity_activation();

CREATE OR REPLACE FUNCTION calendra_validate_location_default_issuer()
RETURNS trigger AS $$
DECLARE
    issuer_active BOOLEAN;
BEGIN
    IF NEW.default_legal_entity_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT active INTO issuer_active FROM legal_entities WHERE id = NEW.default_legal_entity_id;
    IF issuer_active IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Default location invoice issuer does not exist';
    END IF;
    IF issuer_active IS NOT TRUE OR NOT EXISTS (
        SELECT 1 FROM company_legal_entities cle
         WHERE cle.company_id = NEW.company_id
           AND cle.legal_entity_id = NEW.default_legal_entity_id
           AND cle.active = TRUE
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Default location invoice issuer is not active and assigned to the operating unit';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_location_default_issuer ON locations;
CREATE TRIGGER trg_location_default_issuer
BEFORE INSERT OR UPDATE OF company_id, default_legal_entity_id ON locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_location_default_issuer();

-- Provision a default issuer, series and branch for companies created after this migration.
-- This also covers raw SQL/load-test provisioning paths that bypass JPA services.
CREATE OR REPLACE FUNCTION calendra_ensure_company_invoice_foundation()
RETURNS trigger AS $$
DECLARE
    legal_id BIGINT;
    series_id BIGINT;
    default_location_id BIGINT;
BEGIN
    SELECT cle.legal_entity_id INTO legal_id
      FROM company_legal_entities cle
     WHERE cle.company_id = NEW.id AND cle.default_issuer = TRUE AND cle.active = TRUE
     ORDER BY cle.id LIMIT 1;

    IF legal_id IS NULL THEN
        INSERT INTO legal_entities (
            created_at, updated_at, workspace_id, name, country, currency,
            fiscal_environment, active
        ) VALUES (
            COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()), NEW.workspace_id,
            COALESCE(NULLIF(NEW.name, ''), 'Operating unit ' || NEW.id), 'SI', 'EUR', 'TEST', TRUE
        ) RETURNING id INTO legal_id;

        INSERT INTO company_legal_entities (
            created_at, updated_at, company_id, legal_entity_id, default_issuer, active
        ) VALUES (now(), now(), NEW.id, legal_id, TRUE, TRUE);
    END IF;

    SELECT id INTO default_location_id
      FROM locations
     WHERE company_id = NEW.id
     ORDER BY default_location DESC, id ASC
     LIMIT 1;

    IF default_location_id IS NULL THEN
        INSERT INTO locations (
            created_at, updated_at, company_id, name, timezone,
            default_location, active, public_booking_enabled, default_legal_entity_id
        ) VALUES (
            now(), now(), NEW.id, COALESCE(NULLIF(NEW.name, ''), 'Default location'),
            'Europe/Ljubljana', TRUE, TRUE, TRUE, legal_id
        ) RETURNING id INTO default_location_id;
    ELSE
        UPDATE locations
           SET default_legal_entity_id = COALESCE(default_legal_entity_id, legal_id),
               updated_at = now()
         WHERE id = default_location_id;
    END IF;

    SELECT cle.default_invoice_series_id INTO series_id
      FROM company_legal_entities cle
     WHERE cle.company_id = NEW.id AND cle.legal_entity_id = legal_id;

    IF series_id IS NULL THEN
        INSERT INTO invoice_series (
            created_at, updated_at, workspace_id, legal_entity_id, company_id, location_id,
            name, next_number, initial_number, reset_policy, last_reset_year,
            business_premise_code, electronic_device_id, active
        ) VALUES (
            now(), now(), NEW.workspace_id, legal_id, NEW.id, NULL,
            'Default', '1', '1', 'NONE', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
            (SELECT fiscal_business_premise_code FROM locations WHERE id = default_location_id),
            NULL, TRUE
        ) RETURNING id INTO series_id;

        UPDATE company_legal_entities
           SET default_invoice_series_id = series_id, updated_at = now()
         WHERE company_id = NEW.id AND legal_entity_id = legal_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_ensure_invoice_foundation ON company;
CREATE TRIGGER trg_company_ensure_invoice_foundation
AFTER INSERT ON company
FOR EACH ROW EXECUTE FUNCTION calendra_ensure_company_invoice_foundation();

CREATE OR REPLACE FUNCTION calendra_prepare_bill_issuer()
RETURNS trigger AS $$
DECLARE
    company_workspace BIGINT;
    resolved_legal_entity_id BIGINT;
    resolved_invoice_series_id BIGINT;
    resolved_location_id BIGINT;
    resolved_legal legal_entities%ROWTYPE;
    resolved_series invoice_series%ROWTYPE;
    resolved_location_company BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.company_id IS DISTINCT FROM NEW.company_id
           OR OLD.bill_number IS DISTINCT FROM NEW.bill_number
           OR OLD.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
           OR OLD.invoice_series_id IS DISTINCT FROM NEW.invoice_series_id
           OR OLD.location_id IS DISTINCT FROM NEW.location_id
           OR OLD.issuer_name_snapshot IS DISTINCT FROM NEW.issuer_name_snapshot
           OR OLD.issuer_address_snapshot IS DISTINCT FROM NEW.issuer_address_snapshot
           OR OLD.issuer_postal_code_snapshot IS DISTINCT FROM NEW.issuer_postal_code_snapshot
           OR OLD.issuer_city_snapshot IS DISTINCT FROM NEW.issuer_city_snapshot
           OR OLD.issuer_country_snapshot IS DISTINCT FROM NEW.issuer_country_snapshot
           OR OLD.issuer_tax_number_snapshot IS DISTINCT FROM NEW.issuer_tax_number_snapshot
           OR OLD.issuer_vat_id_snapshot IS DISTINCT FROM NEW.issuer_vat_id_snapshot
           OR OLD.issuer_iban_snapshot IS DISTINCT FROM NEW.issuer_iban_snapshot
           OR OLD.issuer_bic_snapshot IS DISTINCT FROM NEW.issuer_bic_snapshot
           OR OLD.issuer_email_snapshot IS DISTINCT FROM NEW.issuer_email_snapshot
           OR OLD.issuer_telephone_snapshot IS DISTINCT FROM NEW.issuer_telephone_snapshot
           OR OLD.invoice_series_name_snapshot IS DISTINCT FROM NEW.invoice_series_name_snapshot
           OR OLD.fiscal_business_premise_snapshot IS DISTINCT FROM NEW.fiscal_business_premise_snapshot
           OR OLD.fiscal_device_id_snapshot IS DISTINCT FROM NEW.fiscal_device_id_snapshot THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Issued invoice identity and issuer snapshots are immutable';
        END IF;
        RETURN NEW;
    END IF;

    SELECT workspace_id INTO company_workspace FROM company WHERE id = NEW.company_id;
    IF company_workspace IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = format('Company %s does not exist', NEW.company_id);
    END IF;

    IF NEW.legal_entity_id IS NULL THEN
        SELECT cle.legal_entity_id INTO resolved_legal_entity_id
          FROM company_legal_entities cle
         WHERE cle.company_id = NEW.company_id AND cle.active = TRUE
         ORDER BY cle.default_issuer DESC, cle.id ASC
         LIMIT 1;
        NEW.legal_entity_id := resolved_legal_entity_id;
    END IF;
    IF NEW.invoice_series_id IS NULL THEN
        SELECT COALESCE(
                   (SELECT cle.default_invoice_series_id
                      FROM company_legal_entities cle
                     WHERE cle.company_id = NEW.company_id
                       AND cle.legal_entity_id = NEW.legal_entity_id
                       AND cle.active = TRUE),
                   (SELECT series.id
                      FROM invoice_series series
                     WHERE series.legal_entity_id = NEW.legal_entity_id
                       AND series.active = TRUE
                       AND (series.company_id IS NULL OR series.company_id = NEW.company_id)
                     ORDER BY CASE WHEN series.company_id = NEW.company_id THEN 0 ELSE 1 END, series.id
                     LIMIT 1)
               ) INTO resolved_invoice_series_id;
        NEW.invoice_series_id := resolved_invoice_series_id;
    END IF;
    IF NEW.location_id IS NULL THEN
        SELECT id INTO resolved_location_id FROM locations
         WHERE company_id = NEW.company_id
         ORDER BY default_location DESC, id ASC LIMIT 1;
        NEW.location_id := resolved_location_id;
    END IF;

    SELECT * INTO resolved_legal FROM legal_entities WHERE id = NEW.legal_entity_id;
    SELECT * INTO resolved_series FROM invoice_series WHERE id = NEW.invoice_series_id;
    SELECT company_id INTO resolved_location_company FROM locations WHERE id = NEW.location_id;
    IF resolved_legal.id IS NULL OR resolved_series.id IS NULL OR resolved_location_company IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Unable to resolve invoice issuer, series or location';
    END IF;
    IF resolved_legal.workspace_id <> company_workspace THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice issuer belongs to another workspace';
    END IF;
    IF resolved_legal.active IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice issuer is inactive';
    END IF;
    IF resolved_series.active IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series is inactive';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM company_legal_entities cle
         WHERE cle.company_id = NEW.company_id
           AND cle.legal_entity_id = NEW.legal_entity_id
           AND cle.active = TRUE
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice issuer is not assigned to the operating unit';
    END IF;
    IF resolved_series.legal_entity_id <> NEW.legal_entity_id
       OR (resolved_series.company_id IS NOT NULL AND resolved_series.company_id <> NEW.company_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series is not valid for the selected issuer and operating unit';
    END IF;
    IF resolved_series.location_id IS NOT NULL AND resolved_series.location_id <> NEW.location_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series is restricted to another location';
    END IF;
    IF resolved_location_company <> NEW.company_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice location belongs to another operating unit';
    END IF;

    NEW.issuer_name_snapshot := COALESCE(NEW.issuer_name_snapshot, resolved_legal.name);
    NEW.issuer_address_snapshot := COALESCE(NEW.issuer_address_snapshot, resolved_legal.address);
    NEW.issuer_postal_code_snapshot := COALESCE(NEW.issuer_postal_code_snapshot, resolved_legal.postal_code);
    NEW.issuer_city_snapshot := COALESCE(NEW.issuer_city_snapshot, resolved_legal.city);
    NEW.issuer_country_snapshot := COALESCE(NEW.issuer_country_snapshot, resolved_legal.country);
    NEW.issuer_tax_number_snapshot := COALESCE(NEW.issuer_tax_number_snapshot, resolved_legal.tax_number);
    NEW.issuer_vat_id_snapshot := COALESCE(NEW.issuer_vat_id_snapshot, resolved_legal.vat_id);
    NEW.issuer_iban_snapshot := COALESCE(NEW.issuer_iban_snapshot, resolved_legal.iban);
    NEW.issuer_bic_snapshot := COALESCE(NEW.issuer_bic_snapshot, resolved_legal.bic);
    NEW.issuer_email_snapshot := COALESCE(NEW.issuer_email_snapshot, resolved_legal.email);
    NEW.issuer_telephone_snapshot := COALESCE(NEW.issuer_telephone_snapshot, resolved_legal.telephone);
    NEW.invoice_series_name_snapshot := COALESCE(NEW.invoice_series_name_snapshot, resolved_series.name);
    NEW.fiscal_business_premise_snapshot := COALESCE(NEW.fiscal_business_premise_snapshot, resolved_series.business_premise_code);
    NEW.fiscal_device_id_snapshot := COALESCE(NEW.fiscal_device_id_snapshot, resolved_series.electronic_device_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prepare_bill_issuer ON bills;
CREATE TRIGGER trg_prepare_bill_issuer
BEFORE INSERT OR UPDATE ON bills
FOR EACH ROW EXECUTE FUNCTION calendra_prepare_bill_issuer();
