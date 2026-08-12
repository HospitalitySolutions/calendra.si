-- Guest App provider subscriptions are location-level. The existing guest_tenant_links
-- row remains the company/client identity bridge used by wallet, inbox and billing.
CREATE TABLE IF NOT EXISTS guest_location_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    guest_tenant_link_id BIGINT NOT NULL REFERENCES guest_tenant_links(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    status VARCHAR(32) NOT NULL,
    joined_via VARCHAR(32) NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_guest_location_subscription UNIQUE (guest_tenant_link_id, location_id)
);

CREATE INDEX IF NOT EXISTS idx_guest_location_subscriptions_link_status
    ON guest_location_subscriptions(guest_tenant_link_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_guest_location_subscriptions_location_status
    ON guest_location_subscriptions(location_id, status);

-- Preserve existing Guest App behaviour for already-linked guests by subscribing them
-- to every currently discoverable location of the company.
INSERT INTO guest_location_subscriptions (
    created_at, updated_at, guest_tenant_link_id, location_id, status, joined_via, joined_at, last_used_at
)
SELECT
    COALESCE(gtl.created_at, NOW()),
    COALESCE(gtl.updated_at, NOW()),
    gtl.id,
    l.id,
    'ACTIVE',
    COALESCE(gtl.joined_via, 'TENANT_CODE'),
    COALESCE(gtl.joined_at, NOW()),
    gtl.last_used_at
FROM guest_tenant_links gtl
JOIN locations l ON l.company_id = gtl.company_id
WHERE gtl.status = 'ACTIVE'
  AND l.active = TRUE
  AND l.guest_app_discoverable = TRUE
ON CONFLICT (guest_tenant_link_id, location_id) DO NOTHING;

-- If a legacy linked company currently has no discoverable branch, keep one location
-- subscription so the company/client link is not silently lost. It will not appear in
-- provider discovery until the branch is made discoverable again.
INSERT INTO guest_location_subscriptions (
    created_at, updated_at, guest_tenant_link_id, location_id, status, joined_via, joined_at, last_used_at
)
SELECT
    COALESCE(gtl.created_at, NOW()),
    COALESCE(gtl.updated_at, NOW()),
    gtl.id,
    fallback_location.id,
    'ACTIVE',
    COALESCE(gtl.joined_via, 'TENANT_CODE'),
    COALESCE(gtl.joined_at, NOW()),
    gtl.last_used_at
FROM guest_tenant_links gtl
JOIN LATERAL (
    SELECT l.id
    FROM locations l
    WHERE l.company_id = gtl.company_id
      AND l.active = TRUE
    ORDER BY l.default_location DESC, l.name ASC, l.id ASC
    LIMIT 1
) fallback_location ON TRUE
WHERE gtl.status = 'ACTIVE'
  AND NOT EXISTS (
      SELECT 1
      FROM guest_location_subscriptions gls
      WHERE gls.guest_tenant_link_id = gtl.id
        AND gls.status = 'ACTIVE'
  )
ON CONFLICT (guest_tenant_link_id, location_id) DO NOTHING;
