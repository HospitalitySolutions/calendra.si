-- Consumables used WALLET_BENEFITS_VIEW as its temporary frontend visibility permission
-- before dedicated permissions were introduced. Preserve that historical read access for
-- existing custom roles without granting any new write capability. Administrators already
-- bypass custom-role permissions and need no migration.
UPDATE employee_access_roles
SET permissions_json = (permissions_json::jsonb || '["CONSUMABLES_VIEW"]'::jsonb)::text,
    updated_at = CURRENT_TIMESTAMP
WHERE permissions_json IS NOT NULL
  AND permissions_json::jsonb ? 'WALLET_BENEFITS_VIEW'
  AND NOT (permissions_json::jsonb ? 'CONSUMABLES_VIEW');

-- User rows cache the effective custom-role permission JSON, so migrate those copies too.
UPDATE users
SET permissions_json = (permissions_json::jsonb || '["CONSUMABLES_VIEW"]'::jsonb)::text,
    updated_at = CURRENT_TIMESTAMP
WHERE permissions_json IS NOT NULL
  AND permissions_json::jsonb ? 'WALLET_BENEFITS_VIEW'
  AND NOT (permissions_json::jsonb ? 'CONSUMABLES_VIEW');
