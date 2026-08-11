-- Atomic stock transfers between operating locations.
-- One transfer creates exactly one TRANSFER_OUT movement and one TRANSFER_IN movement,
-- both linked back to the immutable transfer record through source_id.

CREATE TABLE IF NOT EXISTS consumable_stock_transfer (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    from_location_id BIGINT NOT NULL,
    to_location_id BIGINT NOT NULL,
    item_name_snapshot VARCHAR(180) NOT NULL,
    unit_snapshot VARCHAR(32) NOT NULL,
    quantity NUMERIC(19,4) NOT NULL,
    unit_cost_snapshot NUMERIC(19,4) NOT NULL DEFAULT 0,
    value_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    idempotency_key VARCHAR(120) NOT NULL,
    note TEXT,
    created_by_id BIGINT,
    CONSTRAINT fk_consumable_stock_transfer_company FOREIGN KEY (company_id)
        REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_stock_transfer_consumable_company FOREIGN KEY (consumable_id, company_id)
        REFERENCES consumable(id, company_id),
    CONSTRAINT fk_consumable_stock_transfer_from_location_company FOREIGN KEY (from_location_id, company_id)
        REFERENCES locations(id, company_id),
    CONSTRAINT fk_consumable_stock_transfer_to_location_company FOREIGN KEY (to_location_id, company_id)
        REFERENCES locations(id, company_id),
    CONSTRAINT fk_consumable_stock_transfer_created_by FOREIGN KEY (created_by_id)
        REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_consumable_stock_transfer_distinct_locations CHECK (from_location_id <> to_location_id),
    CONSTRAINT chk_consumable_stock_transfer_quantity CHECK (quantity > 0),
    CONSTRAINT chk_consumable_stock_transfer_cost CHECK (unit_cost_snapshot >= 0 AND value_amount >= 0),
    CONSTRAINT uq_consumable_stock_transfer_company_key UNIQUE (company_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_stock_transfer_id_company
    ON consumable_stock_transfer(id, company_id);
CREATE INDEX IF NOT EXISTS idx_consumable_stock_transfer_company_created
    ON consumable_stock_transfer(company_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_consumable_stock_transfer_company_from_created
    ON consumable_stock_transfer(company_id, from_location_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_consumable_stock_transfer_company_to_created
    ON consumable_stock_transfer(company_id, to_location_id, created_at DESC, id DESC);

-- An idempotent transfer may produce at most one movement in each direction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_stock_transfer_movement_direction
    ON consumable_stock_movement(company_id, source_type, source_id, movement_type)
    WHERE source_type = 'TRANSFER' AND source_id IS NOT NULL;

-- Extend the existing movement integrity trigger so ad-hoc SQL writers cannot attach transfer
-- movements to the wrong SKU or branch, or reverse their signs.
CREATE OR REPLACE FUNCTION calendra_validate_consumable_stock_movement_location()
RETURNS trigger AS $$
DECLARE consumable_company_id BIGINT;
DECLARE location_company_id BIGINT;
DECLARE session_location_id BIGINT;
DECLARE transfer_consumable_id BIGINT;
DECLARE transfer_from_location_id BIGINT;
DECLARE transfer_to_location_id BIGINT;
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
    ELSIF NEW.source_type = 'TRANSFER' AND NEW.source_id IS NOT NULL THEN
        SELECT t.consumable_id, t.from_location_id, t.to_location_id
          INTO transfer_consumable_id, transfer_from_location_id, transfer_to_location_id
          FROM consumable_stock_transfer t
         WHERE t.id = NEW.source_id
           AND t.company_id = NEW.company_id;
        IF transfer_consumable_id IS NULL THEN
            RAISE EXCEPTION 'Transfer stock movement source % does not exist', NEW.source_id
                USING ERRCODE = '23514';
        END IF;
        IF transfer_consumable_id <> NEW.consumable_id THEN
            RAISE EXCEPTION 'Transfer movement must use the transfer consumable'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.movement_type = 'TRANSFER_OUT' THEN
            IF NEW.location_id <> transfer_from_location_id OR NEW.quantity_delta >= 0 THEN
                RAISE EXCEPTION 'Transfer-out movement must decrease stock at the source location'
                    USING ERRCODE = '23514';
            END IF;
        ELSIF NEW.movement_type = 'TRANSFER_IN' THEN
            IF NEW.location_id <> transfer_to_location_id OR NEW.quantity_delta <= 0 THEN
                RAISE EXCEPTION 'Transfer-in movement must increase stock at the destination location'
                    USING ERRCODE = '23514';
            END IF;
        ELSE
            RAISE EXCEPTION 'Transfer source requires TRANSFER_OUT or TRANSFER_IN movement type'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consumable_stock_movement_validate_location ON consumable_stock_movement;
CREATE TRIGGER trg_consumable_stock_movement_validate_location
BEFORE INSERT OR UPDATE OF company_id, consumable_id, location_id, movement_type, source_type, source_id, quantity_delta
ON consumable_stock_movement
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_stock_movement_location();
