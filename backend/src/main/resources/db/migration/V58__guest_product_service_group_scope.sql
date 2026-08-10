-- Ugodnosti may be scoped to a service group. The existing explicit service rows remain as
-- a snapshot/fallback; service_group_id is authoritative while present so group membership can
-- change without having to edit every benefit.
ALTER TABLE guest_products
    ADD COLUMN IF NOT EXISTS service_group_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_guest_products_service_group'
    ) THEN
        ALTER TABLE guest_products
            ADD CONSTRAINT fk_guest_products_service_group
            FOREIGN KEY (service_group_id)
            REFERENCES service_group(id)
            ON DELETE SET NULL
            NOT VALID;
    END IF;
END $$;

ALTER TABLE guest_products VALIDATE CONSTRAINT fk_guest_products_service_group;

CREATE INDEX IF NOT EXISTS idx_guest_products_service_group_id
    ON guest_products(service_group_id)
    WHERE service_group_id IS NOT NULL;
