-- Phase 5.5D: normalize consumables into a shared catalog plus a per-location stock ledger.
--
-- Consumable remains the company-wide SKU definition. Physical quantities, reorder thresholds
-- and valuation cost are location-owned. Historical company-wide quantity is preserved exactly
-- by assigning it to the historical default location; other existing branches start at zero.

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_id_company ON consumable(id, company_id);

CREATE TABLE IF NOT EXISTS consumable_location_stock (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    current_stock NUMERIC(19, 4) NOT NULL DEFAULT 0,
    minimum_stock NUMERIC(19, 4) NOT NULL DEFAULT 0,
    cost_price NUMERIC(19, 4) NOT NULL DEFAULT 0,
    CONSTRAINT uq_consumable_location_stock UNIQUE (consumable_id, location_id),
    CONSTRAINT fk_consumable_location_stock_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_location_stock_consumable_company FOREIGN KEY (consumable_id, company_id)
        REFERENCES consumable(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_location_stock_location_company FOREIGN KEY (location_id, company_id)
        REFERENCES locations(id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_consumable_location_stock_company_location
    ON consumable_location_stock(company_id, location_id, consumable_id);
CREATE INDEX IF NOT EXISTS idx_consumable_location_stock_low_stock
    ON consumable_location_stock(company_id, location_id, current_stock, minimum_stock);

-- Build one stock row for every current SKU/location pair. Existing company-wide stock can only
-- be attributed safely to the old default branch. Reorder threshold and cost are copied to every
-- branch as the initial configuration so no prior settings disappear.
INSERT INTO consumable_location_stock (
    created_at, updated_at, company_id, consumable_id, location_id,
    current_stock, minimum_stock, cost_price
)
SELECT
    COALESCE(c.created_at, current_timestamp),
    COALESCE(c.updated_at, current_timestamp),
    c.company_id,
    c.id,
    l.id,
    CASE WHEN l.default_location THEN COALESCE(c.current_stock, 0) ELSE 0 END,
    COALESCE(c.minimum_stock, 0),
    COALESCE(c.cost_price, 0)
FROM consumable c
JOIN locations l ON l.company_id = c.company_id
ON CONFLICT (consumable_id, location_id) DO NOTHING;

-- Location ownership on immutable stock movements. Session-linked history uses the booked branch;
-- all remaining legacy movements fall back to the historical default location.
ALTER TABLE consumable_stock_movement ADD COLUMN IF NOT EXISTS location_id BIGINT;

UPDATE consumable_stock_movement m
   SET location_id = sb.location_id
  FROM session_consumable sc
  JOIN session_booking sb ON sb.id = sc.session_booking_id
 WHERE m.location_id IS NULL
   AND m.source_type = 'SESSION'
   AND m.source_id = sc.id
   AND sb.company_id = m.company_id;

UPDATE consumable_stock_movement m
   SET location_id = l.id
  FROM locations l
 WHERE m.location_id IS NULL
   AND l.company_id = m.company_id
   AND l.default_location = TRUE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_consumable_stock_movement_location_company') THEN
        ALTER TABLE consumable_stock_movement
            ADD CONSTRAINT fk_consumable_stock_movement_location_company
            FOREIGN KEY (location_id, company_id) REFERENCES locations(id, company_id);
    END IF;
END $$;
ALTER TABLE consumable_stock_movement ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumable_stock_movement_company_location_created
    ON consumable_stock_movement(company_id, location_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_consumable_stock_movement_location_consumable_created
    ON consumable_stock_movement(location_id, consumable_id, created_at DESC, id DESC);

-- Purchase orders have one receiving branch. Existing development orders are assigned to the
-- historical default branch because the old model had no stronger location signal.
ALTER TABLE consumable_purchase_order ADD COLUMN IF NOT EXISTS location_id BIGINT;
UPDATE consumable_purchase_order po
   SET location_id = l.id
  FROM locations l
 WHERE po.location_id IS NULL
   AND l.company_id = po.company_id
   AND l.default_location = TRUE;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_consumable_purchase_order_location_company') THEN
        ALTER TABLE consumable_purchase_order
            ADD CONSTRAINT fk_consumable_purchase_order_location_company
            FOREIGN KEY (location_id, company_id) REFERENCES locations(id, company_id);
    END IF;
END $$;
ALTER TABLE consumable_purchase_order ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumable_purchase_order_company_location_date
    ON consumable_purchase_order(company_id, location_id, order_date DESC, id DESC);

-- Guard application and ad-hoc SQL writers from ever crossing Company/Location/Consumable boundaries.
CREATE OR REPLACE FUNCTION calendra_validate_consumable_location_stock()
RETURNS trigger AS $$
DECLARE consumable_company_id BIGINT;
DECLARE consumable_tracks_stock BOOLEAN;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id, track_stock INTO consumable_company_id, consumable_tracks_stock
      FROM consumable WHERE id = NEW.consumable_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF consumable_company_id IS NULL OR consumable_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Consumable % does not belong to company %', NEW.consumable_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Inventory location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NEW.minimum_stock < 0 OR NEW.cost_price < 0 THEN
        RAISE EXCEPTION 'Consumable location minimum stock and cost must not be negative'
            USING ERRCODE = '23514';
    END IF;
    IF COALESCE(consumable_tracks_stock, TRUE) AND NEW.current_stock < 0 THEN
        RAISE EXCEPTION 'Tracked consumable location stock must not be negative'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consumable_location_stock_validate ON consumable_location_stock;
CREATE TRIGGER trg_consumable_location_stock_validate
BEFORE INSERT OR UPDATE OF company_id, consumable_id, location_id, current_stock, minimum_stock, cost_price
ON consumable_location_stock
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_location_stock();

CREATE OR REPLACE FUNCTION calendra_validate_consumable_stock_movement_location()
RETURNS trigger AS $$
DECLARE consumable_company_id BIGINT;
DECLARE location_company_id BIGINT;
DECLARE session_location_id BIGINT;
BEGIN
    SELECT company_id INTO consumable_company_id FROM consumable WHERE id = NEW.consumable_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF consumable_company_id IS NULL OR consumable_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Movement consumable % does not belong to company %', NEW.consumable_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Movement location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NEW.source_type = 'SESSION' AND NEW.source_id IS NOT NULL AND NEW.movement_type = 'SESSION_USAGE' THEN
        SELECT sb.location_id INTO session_location_id
          FROM session_consumable sc
          JOIN session_booking sb ON sb.id = sc.session_booking_id
         WHERE sc.id = NEW.source_id
           AND sc.company_id = NEW.company_id;
        IF session_location_id IS NULL THEN
            RAISE EXCEPTION 'Session stock movement source % has no booking location', NEW.source_id
                USING ERRCODE = '23514';
        END IF;
        IF session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Session stock movement must use the booking location'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.source_type = 'SESSION' AND NEW.source_id IS NOT NULL AND NEW.movement_type = 'RETURN' THEN
        SELECT m.location_id INTO session_location_id
          FROM consumable_stock_movement m
         WHERE m.company_id = NEW.company_id
           AND m.source_type = 'SESSION'
           AND m.movement_type = 'SESSION_USAGE'
           AND m.source_id = NEW.source_id
         ORDER BY m.id ASC
         LIMIT 1;
        IF session_location_id IS NULL OR session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Session stock return must use the original usage location'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consumable_stock_movement_validate_location ON consumable_stock_movement;
CREATE TRIGGER trg_consumable_stock_movement_validate_location
BEFORE INSERT OR UPDATE OF company_id, consumable_id, location_id, movement_type, source_type, source_id
ON consumable_stock_movement
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_stock_movement_location();

CREATE OR REPLACE FUNCTION calendra_validate_consumable_purchase_order_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Purchase order location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consumable_purchase_order_validate_location ON consumable_purchase_order;
CREATE TRIGGER trg_consumable_purchase_order_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON consumable_purchase_order
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_purchase_order_location();

-- Keep the catalog/stock matrix usable when a location or SKU is created later. New pairs start at
-- zero; branch-specific minimum stock and cost are intentionally configured explicitly afterwards.
CREATE OR REPLACE FUNCTION calendra_initialize_inventory_for_location()
RETURNS trigger AS $$
BEGIN
    INSERT INTO consumable_location_stock(
        created_at, updated_at, company_id, consumable_id, location_id,
        current_stock, minimum_stock, cost_price
    )
    SELECT current_timestamp, current_timestamp, NEW.company_id, c.id, NEW.id, 0, 0, 0
      FROM consumable c
     WHERE c.company_id = NEW.company_id
    ON CONFLICT (consumable_id, location_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_location_initialize_inventory ON locations;
CREATE TRIGGER trg_location_initialize_inventory
AFTER INSERT ON locations
FOR EACH ROW EXECUTE FUNCTION calendra_initialize_inventory_for_location();

CREATE OR REPLACE FUNCTION calendra_initialize_inventory_for_consumable()
RETURNS trigger AS $$
BEGIN
    INSERT INTO consumable_location_stock(
        created_at, updated_at, company_id, consumable_id, location_id,
        current_stock, minimum_stock, cost_price
    )
    SELECT current_timestamp, current_timestamp, NEW.company_id, NEW.id, l.id, 0, 0, 0
      FROM locations l
     WHERE l.company_id = NEW.company_id
    ON CONFLICT (consumable_id, location_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consumable_initialize_inventory ON consumable;
CREATE TRIGGER trg_consumable_initialize_inventory
AFTER INSERT ON consumable
FOR EACH ROW EXECUTE FUNCTION calendra_initialize_inventory_for_consumable();

-- Remove the denormalized company-wide physical inventory columns only after all historical data
-- has been copied into the location ledger.
ALTER TABLE consumable DROP COLUMN IF EXISTS location;
ALTER TABLE consumable DROP COLUMN IF EXISTS current_stock;
ALTER TABLE consumable DROP COLUMN IF EXISTS minimum_stock;
ALTER TABLE consumable DROP COLUMN IF EXISTS cost_price;
