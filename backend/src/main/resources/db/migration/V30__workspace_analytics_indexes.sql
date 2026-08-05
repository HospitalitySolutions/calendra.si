-- Query support for permission-safe workspace analytics. No transactional data is rewritten.
CREATE INDEX IF NOT EXISTS idx_session_booking_workspace_analytics
    ON session_booking (company_id, start_time, location_id, consultant_id, booking_status, type_id);

CREATE INDEX IF NOT EXISTS idx_session_booking_client_start
    ON session_booking (client_id, start_time, company_id);

CREATE INDEX IF NOT EXISTS idx_session_service_analytics
    ON session_service (session_type_id, session_booking_id, position, start_time);

CREATE INDEX IF NOT EXISTS idx_bills_workspace_analytics
    ON bills (company_id, issue_date, legal_entity_id, invoice_series_id, location_id, consultant_id, payment_status);

CREATE INDEX IF NOT EXISTS idx_clients_workspace_identity_analytics
    ON clients (workspace_client_id, company_id, created_at)
    WHERE workspace_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_workspace_employee_analytics
    ON users (login_account_id, company_id, active, consultant);

CREATE INDEX IF NOT EXISTS idx_session_type_workspace_template_analytics
    ON session_type (workspace_service_template_id, company_id, active);
