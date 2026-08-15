-- Keep workspace-level DB user limits aligned with the same billing entitlement used by
-- PackageAccessService: SIGNUP_USER_COUNT + BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT.
-- This repairs subscriptions provisioned before current-cycle user additions were projected.
WITH subscription_owner AS (
    SELECT ws.id AS subscription_id,
           ws.workspace_id,
           COALESCE(
               ws.legacy_primary_company_id,
               (SELECT MIN(c.id) FROM company c WHERE c.workspace_id = ws.workspace_id)
           ) AS owner_company_id
      FROM workspace_subscriptions ws
), owner_settings AS (
    SELECT so.*,
           (SELECT s.value
              FROM app_settings s
             WHERE s.company_id = so.owner_company_id
               AND s.key = 'SIGNUP_USER_COUNT'
             ORDER BY s.id DESC
             LIMIT 1) AS base_users_raw,
           (SELECT s.value
              FROM app_settings s
             WHERE s.company_id = so.owner_company_id
               AND s.key = 'BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT'
             ORDER BY s.id DESC
             LIMIT 1) AS added_users_raw
      FROM subscription_owner so
), entitlement AS (
    SELECT os.subscription_id,
           os.workspace_id,
           LEAST(
               2147483647::numeric,
               GREATEST(
                   1::numeric,
                   CASE WHEN COALESCE(os.base_users_raw, '') ~ '^[0-9]+$'
                        THEN os.base_users_raw::numeric ELSE 1::numeric END
               )
               + GREATEST(
                   0::numeric,
                   CASE WHEN COALESCE(os.added_users_raw, '') ~ '^[0-9]+$'
                        THEN os.added_users_raw::numeric ELSE 0::numeric END
               )
           )::int AS entitled_users,
           COALESCE((
               SELECT COUNT(DISTINCT u.login_account_id)
                 FROM users u
                 JOIN company c ON c.id = u.company_id
                WHERE c.workspace_id = os.workspace_id
                  AND u.active
           ), 0)::int AS current_active_users,
           COALESCE((
               SELECT COUNT(DISTINCT u.login_account_id)
                 FROM users u
                 JOIN company c ON c.id = u.company_id
                WHERE c.workspace_id = os.workspace_id
                  AND u.active
                  AND u.consultant
           ), 0)::int AS current_consultants
      FROM owner_settings os
)
UPDATE workspace_subscriptions ws
   SET max_active_users = GREATEST(e.entitled_users, e.current_active_users),
       max_consultants = GREATEST(e.entitled_users, e.current_consultants),
       updated_at = CURRENT_TIMESTAMP
  FROM entitlement e
 WHERE ws.id = e.subscription_id;
