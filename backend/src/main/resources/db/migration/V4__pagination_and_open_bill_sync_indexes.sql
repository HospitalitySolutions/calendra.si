-- Pagination and scale indexes used by production list endpoints.

DO $$
BEGIN
    IF to_regclass('public.clients') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_name_id ON clients (company_id, last_name, first_name, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_assigned_name_id ON clients (company_id, assigned_to_id, last_name, first_name, id) WHERE assigned_to_id IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_email_lower ON clients (company_id, lower(email)) WHERE email IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_phone ON clients (company_id, phone) WHERE phone IS NOT NULL';
    END IF;

    IF to_regclass('public.bills') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bills_company_issue_date_id ON bills (company_id, issue_date DESC, id DESC)';
    END IF;

    IF to_regclass('public.open_bills') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_open_bills_company_id_desc ON open_bills (company_id, id DESC)';
    END IF;

    IF to_regclass('public.client_messages') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_messages_company_created_id ON client_messages (company_id, created_at DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_messages_company_client_created_id ON client_messages (company_id, client_id, created_at DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_messages_company_client_conversation_created_id ON client_messages (company_id, client_id, conversation_key, created_at DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_client_messages_company_channel_created_id ON client_messages (company_id, channel, created_at DESC, id DESC)';
    END IF;

    IF to_regclass('public.guest_orders') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_orders_guest_company_created_id ON guest_orders (guest_user_id, company_id, created_at DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_orders_guest_company_status_created_id ON guest_orders (guest_user_id, company_id, status, created_at DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_orders_client_company_status_created_id ON guest_orders (client_id, company_id, status, created_at DESC, id DESC)';
    END IF;
END $$;
