\set ON_ERROR_STOP on

-- Phase 5F workspace integrity audit. Run after Flyway and before enabling
-- workspace features. Any result row indicates data that must be repaired.
WITH violations AS (
    SELECT 'companies_without_workspace' AS check_name, count(*)::bigint AS violation_count
      FROM company WHERE workspace_id IS NULL
    UNION ALL
    SELECT 'memberships_without_login_account', count(*)::bigint
      FROM users WHERE login_account_id IS NULL
    UNION ALL
    SELECT 'clients_without_workspace_identity', count(*)::bigint
      FROM clients WHERE workspace_client_id IS NULL
    UNION ALL
    SELECT 'spaces_with_invalid_location', count(*)::bigint
      FROM space s
      LEFT JOIN locations l ON l.id = s.location_id
     WHERE s.location_id IS NULL OR l.id IS NULL OR l.company_id <> s.company_id
    UNION ALL
    SELECT 'bookings_with_invalid_location', count(*)::bigint
      FROM session_booking b
      LEFT JOIN locations l ON l.id = b.location_id
     WHERE b.location_id IS NULL OR l.id IS NULL OR l.company_id <> b.company_id
    UNION ALL
    SELECT 'bills_without_issuer_foundation', count(*)::bigint
      FROM bills
     WHERE legal_entity_id IS NULL OR invoice_series_id IS NULL OR location_id IS NULL
    UNION ALL
    SELECT 'services_without_workspace_template', count(*)::bigint
      FROM session_type WHERE workspace_service_template_id IS NULL
    UNION ALL
    SELECT 'active_workspaces_without_subscription', count(*)::bigint
      FROM workspaces w
      LEFT JOIN workspace_subscriptions s ON s.workspace_id = w.id
     WHERE w.active = true AND s.id IS NULL
)
SELECT check_name, violation_count
  FROM violations
 WHERE violation_count > 0
 ORDER BY check_name;

DO $$
DECLARE
    violation_total bigint;
BEGIN
    SELECT
        (SELECT count(*) FROM company WHERE workspace_id IS NULL)
      + (SELECT count(*) FROM users WHERE login_account_id IS NULL)
      + (SELECT count(*) FROM clients WHERE workspace_client_id IS NULL)
      + (SELECT count(*) FROM space s LEFT JOIN locations l ON l.id=s.location_id
          WHERE s.location_id IS NULL OR l.id IS NULL OR l.company_id<>s.company_id)
      + (SELECT count(*) FROM session_booking b LEFT JOIN locations l ON l.id=b.location_id
          WHERE b.location_id IS NULL OR l.id IS NULL OR l.company_id<>b.company_id)
      + (SELECT count(*) FROM bills
          WHERE legal_entity_id IS NULL OR invoice_series_id IS NULL OR location_id IS NULL)
      + (SELECT count(*) FROM session_type WHERE workspace_service_template_id IS NULL)
      + (SELECT count(*) FROM workspaces w LEFT JOIN workspace_subscriptions s ON s.workspace_id=w.id
          WHERE w.active=true AND s.id IS NULL)
      INTO violation_total;

    IF violation_total > 0 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = format('Workspace integrity audit found %s violation(s).', violation_total),
            HINT = 'Review the result rows above before enabling workspace rollout flags.';
    END IF;
END $$;
