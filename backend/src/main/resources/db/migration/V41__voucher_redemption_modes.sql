ALTER TABLE guest_products
    ADD COLUMN IF NOT EXISTS voucher_redemption_mode VARCHAR(16),
    ADD COLUMN IF NOT EXISTS voucher_service_scope VARCHAR(32),
    ADD COLUMN IF NOT EXISTS voucher_face_value_gross NUMERIC(12, 2);

-- Existing GIFT_CARD products were monetary-balance gift cards. Preserve that behaviour.
UPDATE guest_products
SET voucher_redemption_mode = COALESCE(voucher_redemption_mode, 'VALUE'),
    voucher_service_scope = COALESCE(voucher_service_scope, 'ALL_SERVICES'),
    voucher_face_value_gross = COALESCE(voucher_face_value_gross, price_gross)
WHERE product_type = 'GIFT_CARD';

CREATE TABLE IF NOT EXISTS guest_product_voucher_session_types (
    product_id BIGINT NOT NULL,
    session_type_id BIGINT NOT NULL,
    PRIMARY KEY (product_id, session_type_id),
    CONSTRAINT fk_guest_product_voucher_session_types_product
        FOREIGN KEY (product_id) REFERENCES guest_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_guest_product_voucher_session_types_session_type
        FOREIGN KEY (session_type_id) REFERENCES session_type(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guest_product_voucher_session_types_session_type
    ON guest_product_voucher_session_types(session_type_id);
