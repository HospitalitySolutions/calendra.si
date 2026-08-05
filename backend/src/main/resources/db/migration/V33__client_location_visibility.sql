-- Persist the physical location on open bills so draft/unissued billing can be filtered reliably.
ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS location_id BIGINT;

UPDATE open_bills ob
   SET location_id = sb.location_id
  FROM session_booking sb
 WHERE ob.session_booking_id = sb.id
   AND ob.location_id IS NULL;

UPDATE open_bills ob
   SET location_id = source.location_id
  FROM (
      SELECT DISTINCT ON (obi.open_bill_id)
             obi.open_bill_id, sb.location_id
        FROM open_bill_items obi
        JOIN session_booking sb ON sb.id = obi.source_session_booking_id
       WHERE obi.source_session_booking_id > 0
         AND sb.location_id IS NOT NULL
       ORDER BY obi.open_bill_id, obi.id
  ) source
 WHERE ob.id = source.open_bill_id
   AND ob.location_id IS NULL;

UPDATE open_bills ob
   SET location_id = l.id
  FROM locations l
 WHERE l.company_id = ob.company_id
   AND l.default_location = TRUE
   AND ob.location_id IS NULL;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_location') THEN
        ALTER TABLE open_bills
            ADD CONSTRAINT fk_open_bills_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_open_bills_company_location
    ON open_bills(company_id, location_id, id DESC);

CREATE OR REPLACE FUNCTION calendra_validate_open_bill_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        SELECT id INTO NEW.location_id
          FROM locations
         WHERE company_id = NEW.company_id
           AND default_location = TRUE
         ORDER BY id
         LIMIT 1;
    END IF;

    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Open bill location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_open_bill_validate_location ON open_bills;
CREATE TRIGGER trg_open_bill_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON open_bills
FOR EACH ROW EXECUTE FUNCTION calendra_validate_open_bill_location();

CREATE TABLE client_assigned_locations (
    client_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    PRIMARY KEY (client_id, location_id),
    CONSTRAINT fk_client_assigned_locations_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_assigned_locations_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);
CREATE INDEX idx_client_assigned_locations_location ON client_assigned_locations(location_id);

CREATE TABLE client_company_assigned_locations (
    client_company_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    PRIMARY KEY (client_company_id, location_id),
    CONSTRAINT fk_client_company_assigned_locations_company FOREIGN KEY (client_company_id) REFERENCES client_companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_company_assigned_locations_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);
CREATE INDEX idx_client_company_assigned_locations_location ON client_company_assigned_locations(location_id);

CREATE TABLE client_group_assigned_locations (
    group_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    PRIMARY KEY (group_id, location_id),
    CONSTRAINT fk_client_group_assigned_locations_group FOREIGN KEY (group_id) REFERENCES client_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_group_assigned_locations_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);
CREATE INDEX idx_client_group_assigned_locations_location ON client_group_assigned_locations(location_id);

-- Guard tenant isolation even for imports and direct SQL writes.
CREATE OR REPLACE FUNCTION calendra_validate_client_assigned_location()
RETURNS trigger AS $$
DECLARE client_company_id BIGINT;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id INTO client_company_id FROM clients WHERE id = NEW.client_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF client_company_id IS NULL OR location_company_id IS NULL OR client_company_id <> location_company_id THEN
        RAISE EXCEPTION 'Client % and location % do not belong to the same company', NEW.client_id, NEW.location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_assigned_location_validate
BEFORE INSERT OR UPDATE ON client_assigned_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_client_assigned_location();

CREATE OR REPLACE FUNCTION calendra_validate_client_company_assigned_location()
RETURNS trigger AS $$
DECLARE owner_company_id BIGINT;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT cc.owner_company_id INTO owner_company_id FROM client_companies cc WHERE cc.id = NEW.client_company_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF owner_company_id IS NULL OR location_company_id IS NULL OR owner_company_id <> location_company_id THEN
        RAISE EXCEPTION 'Client company % and location % do not belong to the same company', NEW.client_company_id, NEW.location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_company_assigned_location_validate
BEFORE INSERT OR UPDATE ON client_company_assigned_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_client_company_assigned_location();

CREATE OR REPLACE FUNCTION calendra_validate_client_group_assigned_location()
RETURNS trigger AS $$
DECLARE group_company_id BIGINT;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id INTO group_company_id FROM client_groups WHERE id = NEW.group_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF group_company_id IS NULL OR location_company_id IS NULL OR group_company_id <> location_company_id THEN
        RAISE EXCEPTION 'Client group % and location % do not belong to the same company', NEW.group_id, NEW.location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_group_assigned_location_validate
BEFORE INSERT OR UPDATE ON client_group_assigned_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_client_group_assigned_location();
