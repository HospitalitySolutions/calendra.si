-- Procurement phase: real purchase-order lines, partial receiving and idempotent receipt events.
-- Purchase orders existed before this migration as header-only records. Existing rows remain valid
-- and simply start with zero lines.

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_purchase_order_id_company
    ON consumable_purchase_order(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_supplier_id_company
    ON consumable_supplier(id, company_id);

CREATE TABLE IF NOT EXISTS consumable_purchase_order_line (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    purchase_order_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    item_name_snapshot VARCHAR(180) NOT NULL,
    unit_snapshot VARCHAR(32) NOT NULL,
    ordered_quantity NUMERIC(19,4) NOT NULL,
    received_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
    unit_price NUMERIC(19,4) NOT NULL DEFAULT 0,
    vat_rate VARCHAR(24) NOT NULL DEFAULT 'NO_VAT',
    CONSTRAINT uq_consumable_purchase_order_line_item UNIQUE (purchase_order_id, consumable_id),
    CONSTRAINT fk_consumable_po_line_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_line_order_company FOREIGN KEY (purchase_order_id, company_id)
        REFERENCES consumable_purchase_order(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_line_consumable_company FOREIGN KEY (consumable_id, company_id)
        REFERENCES consumable(id, company_id),
    CONSTRAINT chk_consumable_po_line_qty CHECK (ordered_quantity > 0 AND received_quantity >= 0 AND received_quantity <= ordered_quantity),
    CONSTRAINT chk_consumable_po_line_price CHECK (unit_price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_po_line_id_company
    ON consumable_purchase_order_line(id, company_id);

CREATE INDEX IF NOT EXISTS idx_consumable_po_line_company_order
    ON consumable_purchase_order_line(company_id, purchase_order_id, id);
CREATE INDEX IF NOT EXISTS idx_consumable_po_line_company_consumable
    ON consumable_purchase_order_line(company_id, consumable_id);

CREATE TABLE IF NOT EXISTS consumable_purchase_order_receipt (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    purchase_order_id BIGINT NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    note TEXT,
    created_by_id BIGINT,
    CONSTRAINT uq_consumable_po_receipt_idempotency UNIQUE (purchase_order_id, idempotency_key),
    CONSTRAINT fk_consumable_po_receipt_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_receipt_order_company FOREIGN KEY (purchase_order_id, company_id)
        REFERENCES consumable_purchase_order(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_receipt_user FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_po_receipt_id_company
    ON consumable_purchase_order_receipt(id, company_id);

CREATE INDEX IF NOT EXISTS idx_consumable_po_receipt_company_order_received
    ON consumable_purchase_order_receipt(company_id, purchase_order_id, received_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS consumable_purchase_order_receipt_line (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    receipt_id BIGINT NOT NULL,
    purchase_order_line_id BIGINT NOT NULL,
    quantity NUMERIC(19,4) NOT NULL,
    CONSTRAINT uq_consumable_po_receipt_line UNIQUE (receipt_id, purchase_order_line_id),
    CONSTRAINT fk_consumable_po_receipt_line_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_receipt_line_receipt_company FOREIGN KEY (receipt_id, company_id)
        REFERENCES consumable_purchase_order_receipt(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_receipt_line_order_line_company FOREIGN KEY (purchase_order_line_id, company_id)
        REFERENCES consumable_purchase_order_line(id, company_id),
    CONSTRAINT chk_consumable_po_receipt_line_qty CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_consumable_po_receipt_line_receipt
    ON consumable_purchase_order_receipt_line(receipt_id, id);

-- Prevent cross-tenant supplier assignment at the database layer as well.
CREATE OR REPLACE FUNCTION calendra_validate_consumable_purchase_order_supplier()
RETURNS trigger AS $$
DECLARE supplier_company_id BIGINT;
BEGIN
    IF NEW.supplier_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT company_id INTO supplier_company_id FROM consumable_supplier WHERE id = NEW.supplier_id;
    IF supplier_company_id IS NULL OR supplier_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Purchase order supplier % does not belong to company %', NEW.supplier_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consumable_purchase_order_validate_supplier ON consumable_purchase_order;
CREATE TRIGGER trg_consumable_purchase_order_validate_supplier
BEFORE INSERT OR UPDATE OF company_id, supplier_id ON consumable_purchase_order
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_purchase_order_supplier();
