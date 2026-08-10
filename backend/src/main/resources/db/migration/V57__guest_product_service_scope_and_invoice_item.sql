-- Wallet entitlements can be valid for multiple booking services while using a
-- separate transaction service for invoicing/VAT. Keep guest_products.session_type_id
-- as a backwards-compatible primary service pointer while the join table becomes
-- the authoritative scope for non-voucher entitlements when it has rows.
CREATE TABLE IF NOT EXISTS guest_product_session_types (
    product_id BIGINT NOT NULL,
    session_type_id BIGINT NOT NULL,
    PRIMARY KEY (product_id, session_type_id),
    CONSTRAINT fk_guest_product_session_types_product
        FOREIGN KEY (product_id) REFERENCES guest_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_guest_product_session_types_session_type
        FOREIGN KEY (session_type_id) REFERENCES session_type(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guest_product_session_types_session_type
    ON guest_product_session_types(session_type_id);

-- Preserve existing single-service configuration as the initial eligibility set.
INSERT INTO guest_product_session_types (product_id, session_type_id)
SELECT id, session_type_id
FROM guest_products
WHERE session_type_id IS NOT NULL
  AND product_type <> 'GIFT_CARD'
ON CONFLICT DO NOTHING;
