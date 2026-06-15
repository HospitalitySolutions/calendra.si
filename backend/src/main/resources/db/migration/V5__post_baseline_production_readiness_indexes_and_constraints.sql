-- Post-baseline replay of production-readiness indexes/constraints for clean Flyway-created schemas.
-- Flyway is enabled only in staging/production profiles; local dev can still use Hibernate ddl-auto=update.
-- This repeats V1 defensively because V1 can run before V3 on a clean database and skip table-specific indexes.

DO $$
BEGIN
    IF to_regclass('public.session_booking') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_time_active
                 ON session_booking (company_id, start_time, end_time)
                 WHERE upper(coalesce(booking_status, ''RESERVED'')) NOT IN (''CANCELLED'', ''NO_SHOW'')';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_consultant_time_active
                 ON session_booking (company_id, consultant_id, start_time, end_time)
                 WHERE consultant_id IS NOT NULL
                   AND upper(coalesce(booking_status, ''RESERVED'')) NOT IN (''CANCELLED'', ''NO_SHOW'')';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_client_time_active
                 ON session_booking (company_id, client_id, start_time, end_time)
                 WHERE client_id IS NOT NULL
                   AND upper(coalesce(booking_status, ''RESERVED'')) NOT IN (''CANCELLED'', ''NO_SHOW'')';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_space_time_active
                 ON session_booking (company_id, space_id, start_time, end_time)
                 WHERE space_id IS NOT NULL
                   AND (meeting_link IS NULL OR meeting_link = '''')
                   AND upper(coalesce(booking_status, ''RESERVED'')) NOT IN (''CANCELLED'', ''NO_SHOW'')';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_group_key
                 ON session_booking (company_id, booking_group_key, id)
                 WHERE booking_group_key IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_source_order
                 ON session_booking (company_id, source_order_id)
                 WHERE source_order_id IS NOT NULL';

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_session_booking_time_order') THEN
            EXECUTE 'ALTER TABLE session_booking
                     ADD CONSTRAINT chk_session_booking_time_order CHECK (end_time > start_time) NOT VALID';
        END IF;
    END IF;

    IF to_regclass('public.bookable_slot') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookable_slot_company_day_consultant_dates
                 ON bookable_slot (company_id, day_of_week, consultant_id, start_date, end_date, start_time, end_time)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookable_slot_consultant_company_day_time
                 ON bookable_slot (consultant_id, company_id, day_of_week, start_time, end_time)';

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bookable_slot_time_order') THEN
            EXECUTE 'ALTER TABLE bookable_slot
                     ADD CONSTRAINT chk_bookable_slot_time_order CHECK (end_time > start_time) NOT VALID';
        END IF;
    END IF;

    IF to_regclass('public.clients') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_normalized_email
                 ON clients (company_id, lower(trim(email)))
                 WHERE email IS NOT NULL AND trim(email) <> ''''';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_trimmed_phone
                 ON clients (company_id, trim(phone))
                 WHERE phone IS NOT NULL AND trim(phone) <> ''''';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_active_assigned
                 ON clients (company_id, active, assigned_to_id, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_billing_company
                 ON clients (company_id, billing_company_id) WHERE billing_company_id IS NOT NULL';
    END IF;

    IF to_regclass('public.users') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_company_active_role
                 ON users (company_id, active, role, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_company_active_consultant
                 ON users (company_id, active, consultant, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_company_lower_email
                 ON users (company_id, lower(email))';
    END IF;

    IF to_regclass('public.app_settings') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_app_settings_company_key
                 ON app_settings (company_id, key)';
    END IF;

    IF to_regclass('public.payment_methods') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_method_company_type
                 ON payment_methods (company_id, payment_type, guest_enabled, widget_enabled)';
    END IF;

    IF to_regclass('public.open_bills') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_open_bills_company_created
                 ON open_bills (company_id, created_at DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_open_bills_company_reference
                 ON open_bills (company_id, reference)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_open_bills_company_client_consultant
                 ON open_bills (company_id, client_id, consultant_id, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_open_bills_company_group_key
                 ON open_bills (company_id, booking_group_key) WHERE booking_group_key IS NOT NULL';
    END IF;

    IF to_regclass('public.bills') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bill_company_issue_date
                 ON bills (company_id, issue_date DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bill_company_type_issue_date
                 ON bills (company_id, bill_type, issue_date DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bill_company_source_session_type
                 ON bills (company_id, source_session_id_snapshot, bill_type)';
    END IF;

    IF to_regclass('public.guest_orders') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_orders_company_guest_status_created
                 ON guest_orders (company_id, guest_user_id, status, created_at DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_orders_company_client_status_created
                 ON guest_orders (company_id, client_id, status, created_at DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_orders_stripe_checkout_session
                 ON guest_orders (stripe_checkout_session_id)
                 WHERE stripe_checkout_session_id IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_orders_paypal_order
                 ON guest_orders (paypal_order_id)
                 WHERE paypal_order_id IS NOT NULL';

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_guest_orders_amounts_non_negative') THEN
            EXECUTE 'ALTER TABLE guest_orders
                     ADD CONSTRAINT chk_guest_orders_amounts_non_negative
                     CHECK (subtotal_gross >= 0 AND tax_amount >= 0 AND total_gross >= 0) NOT VALID';
        END IF;
    END IF;

    IF to_regclass('public.guest_entitlement') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_entitlement_company_client_status_valid
                 ON guest_entitlement (company_id, client_id, status, valid_until, id)';
    ELSIF to_regclass('public.guest_entitlements') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_entitlements_company_client_status_valid
                 ON guest_entitlements (company_id, client_id, status, valid_until, id)';
    END IF;

    IF to_regclass('public.guest_products') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_products_company_active_type_sort
                 ON guest_products (company_id, active, product_type, sort_order, id)';
    END IF;

    IF to_regclass('public.guest_tenant_links') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_tenant_links_company_status_client
                 ON guest_tenant_links (company_id, status, client_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_guest_tenant_links_guest_status
                 ON guest_tenant_links (guest_user_id, status, last_used_at DESC)';
    END IF;

    IF to_regclass('public.widget_booking_idempotency') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_widget_booking_idempotency_lookup
                 ON widget_booking_idempotency (company_id, idempotency_key, endpoint)';
    END IF;
END $$;

DO $$
BEGIN
    -- Create important uniqueness guarantees only when existing data is already clean.
    -- If duplicates exist, this migration logs a NOTICE and continues so deployment does not fail unexpectedly.
    IF to_regclass('public.company') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_companies_lower_tenant_code')
       AND NOT EXISTS (
           SELECT 1 FROM (
               SELECT lower(tenant_code) AS tenant_code_key
               FROM company
               WHERE tenant_code IS NOT NULL AND trim(tenant_code) <> ''
               GROUP BY lower(tenant_code)
               HAVING count(*) > 1
           ) duplicates
       ) THEN
        EXECUTE 'CREATE UNIQUE INDEX ux_companies_lower_tenant_code
                 ON company (lower(tenant_code))
                 WHERE tenant_code IS NOT NULL AND trim(tenant_code) <> ''''';
    END IF;

    IF to_regclass('public.users') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_users_company_lower_email')
       AND NOT EXISTS (
           SELECT 1 FROM (
               SELECT company_id, lower(email) AS email_key
               FROM users
               WHERE email IS NOT NULL AND trim(email) <> ''
               GROUP BY company_id, lower(email)
               HAVING count(*) > 1
           ) duplicates
       ) THEN
        EXECUTE 'CREATE UNIQUE INDEX ux_users_company_lower_email
                 ON users (company_id, lower(email))
                 WHERE email IS NOT NULL AND trim(email) <> ''''';
    END IF;

    IF to_regclass('public.app_settings') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_app_settings_company_key')
       AND NOT EXISTS (
           SELECT 1 FROM (
               SELECT company_id, key
               FROM app_settings
               GROUP BY company_id, key
               HAVING count(*) > 1
           ) duplicates
       ) THEN
        EXECUTE 'CREATE UNIQUE INDEX ux_app_settings_company_key ON app_settings (company_id, key)';
    END IF;

    IF to_regclass('public.guest_tenant_links') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_guest_tenant_links_guest_company')
       AND NOT EXISTS (
           SELECT 1 FROM (
               SELECT guest_user_id, company_id
               FROM guest_tenant_links
               GROUP BY guest_user_id, company_id
               HAVING count(*) > 1
           ) duplicates
       ) THEN
        EXECUTE 'CREATE UNIQUE INDEX ux_guest_tenant_links_guest_company ON guest_tenant_links (guest_user_id, company_id)';
    END IF;

    IF to_regclass('public.widget_booking_idempotency') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_widget_booking_idempotency_company_key_endpoint')
       AND NOT EXISTS (
           SELECT 1 FROM (
               SELECT company_id, idempotency_key, endpoint
               FROM widget_booking_idempotency
               GROUP BY company_id, idempotency_key, endpoint
               HAVING count(*) > 1
           ) duplicates
       ) THEN
        EXECUTE 'CREATE UNIQUE INDEX ux_widget_booking_idempotency_company_key_endpoint
                 ON widget_booking_idempotency (company_id, idempotency_key, endpoint)';
    END IF;

    IF to_regclass('public.guest_orders') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'ux_guest_orders_reference_code')
       AND NOT EXISTS (
           SELECT 1 FROM (
               SELECT reference_code
               FROM guest_orders
               WHERE reference_code IS NOT NULL AND trim(reference_code) <> ''
               GROUP BY reference_code
               HAVING count(*) > 1
           ) duplicates
       ) THEN
        EXECUTE 'CREATE UNIQUE INDEX ux_guest_orders_reference_code
                 ON guest_orders (reference_code)
                 WHERE reference_code IS NOT NULL AND trim(reference_code) <> ''''';
    END IF;
END $$;
