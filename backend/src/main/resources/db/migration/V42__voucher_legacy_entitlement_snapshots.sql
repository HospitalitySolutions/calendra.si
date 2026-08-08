-- Freeze the semantics of all legacy GIFT_CARD entitlements before products can be edited
-- into the new SERVICE/VALUE voucher model. Historical cards were monetary and valid for all
-- services. Prefer the observed balance + still-recorded redemptions because that preserves the
-- exact face value of partially used cards; use the legacy product value only as a fallback for
-- old rows that no longer have enough redemption history to reconstruct it.
WITH legacy_amounts AS (
    SELECT
        ge.id,
        COALESCE(ge.remaining_value_gross, 0::numeric)
            + COALESCE((
                SELECT SUM(GREATEST(gu.units_used, 0))::numeric / 100
                FROM guest_entitlement_usages gu
                WHERE gu.entitlement_id = ge.id
            ), 0::numeric) AS observed_face_value,
        COALESCE(gp.voucher_face_value_gross, gp.price_gross, 0::numeric) AS product_face_value
    FROM guest_entitlements ge
    LEFT JOIN guest_products gp ON gp.id = ge.product_id
    WHERE ge.entitlement_type = 'GIFT_CARD'
      AND NOT ((COALESCE(NULLIF(BTRIM(ge.metadata_json), ''), '{}')::jsonb) ? 'voucherMode')
),
legacy AS (
    SELECT
        id,
        CASE
            WHEN observed_face_value > 0 THEN observed_face_value
            ELSE product_face_value
        END AS reconstructed_face_value
    FROM legacy_amounts
)
UPDATE guest_entitlements ge
SET metadata_json = (
    COALESCE(NULLIF(BTRIM(ge.metadata_json), ''), '{}')::jsonb
    || jsonb_build_object(
        'voucherMode', 'VALUE',
        'voucherScope', 'ALL_SERVICES',
        'eligibleSessionTypeIds', '[]'::jsonb,
        'eligibleServiceNames', '[]'::jsonb,
        'faceValueGross', ROUND(legacy.reconstructed_face_value, 2)
    )
)::text
FROM legacy
WHERE ge.id = legacy.id;
