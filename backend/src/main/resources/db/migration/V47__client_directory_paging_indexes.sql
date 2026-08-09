-- Client directory paging/search/sorting support.
-- Keep these indexes narrow and aligned with the default active + name ordering used by the UI.
CREATE INDEX IF NOT EXISTS idx_clients_company_active_name_page
    ON clients (company_id, active, lower(last_name), lower(first_name), id);

CREATE INDEX IF NOT EXISTS idx_client_companies_owner_active_name_page
    ON client_companies (owner_company_id, active, lower(name), id);

CREATE INDEX IF NOT EXISTS idx_client_groups_company_active_name_page
    ON client_groups (company_id, active, lower(name), id);
