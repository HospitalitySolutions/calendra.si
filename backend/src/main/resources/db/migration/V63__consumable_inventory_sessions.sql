-- Inventory sessions preserve a physical-count snapshot and only affect live stock when finalized.
-- This makes inventory auditable and prevents draft counts from changing stock.

CREATE TABLE IF NOT EXISTS consumable_inventory_session (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS',
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    started_by_id BIGINT,
    completed_by_id BIGINT,
    notes TEXT,
    CONSTRAINT fk_consumable_inventory_session_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_inventory_session_location_company FOREIGN KEY (location_id, company_id)
        REFERENCES locations(id, company_id),
    CONSTRAINT fk_consumable_inventory_session_started_by FOREIGN KEY (started_by_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_consumable_inventory_session_completed_by FOREIGN KEY (completed_by_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_consumable_inventory_session_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_inventory_session_id_company
    ON consumable_inventory_session(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_inventory_session_active_location
    ON consumable_inventory_session(company_id, location_id)
    WHERE status = 'IN_PROGRESS';
CREATE INDEX IF NOT EXISTS idx_consumable_inventory_session_company_location_started
    ON consumable_inventory_session(company_id, location_id, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS consumable_inventory_line (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    inventory_session_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    item_name_snapshot VARCHAR(180) NOT NULL,
    category_name_snapshot VARCHAR(140),
    unit_snapshot VARCHAR(32) NOT NULL,
    system_quantity NUMERIC(19,4) NOT NULL,
    counted_quantity NUMERIC(19,4),
    cost_price_snapshot NUMERIC(19,4) NOT NULL DEFAULT 0,
    counted_at TIMESTAMP WITH TIME ZONE,
    counted_by_id BIGINT,
    notes TEXT,
    CONSTRAINT uq_consumable_inventory_line_item UNIQUE (inventory_session_id, consumable_id),
    CONSTRAINT fk_consumable_inventory_line_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_inventory_line_session_company FOREIGN KEY (inventory_session_id, company_id)
        REFERENCES consumable_inventory_session(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_inventory_line_consumable_company FOREIGN KEY (consumable_id, company_id)
        REFERENCES consumable(id, company_id),
    CONSTRAINT fk_consumable_inventory_line_counted_by FOREIGN KEY (counted_by_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_consumable_inventory_line_system_qty CHECK (system_quantity >= 0),
    CONSTRAINT chk_consumable_inventory_line_counted_qty CHECK (counted_quantity IS NULL OR counted_quantity >= 0),
    CONSTRAINT chk_consumable_inventory_line_cost CHECK (cost_price_snapshot >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_inventory_line_id_company
    ON consumable_inventory_line(id, company_id);
CREATE INDEX IF NOT EXISTS idx_consumable_inventory_line_company_session
    ON consumable_inventory_line(company_id, inventory_session_id, id);

-- One finalization may create at most one inventory movement per article/location.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_inventory_count_movement_source
    ON consumable_stock_movement(company_id, source_type, source_id, consumable_id, location_id)
    WHERE source_type = 'INVENTORY_COUNT' AND source_id IS NOT NULL;
