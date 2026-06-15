-- Production scale hardening:
-- 1) dirty/due open-bill sync queue so scheduled workers process only affected sessions/groups;
-- 2) DB-limited guest/mobile list indexes;
-- 3) fail-fast validation of critical relational constraints after the baseline schema.

DO $$
DECLARE
    required_table text;
    required_tables text[] := ARRAY[
        'company', 'users', 'clients', 'session_booking', 'session_type', 'space',
        'transaction_service', 'payment_methods', 'open_bills', 'open_bill_items',
        'bills', 'bill_item', 'guest_users', 'guest_orders', 'guest_order_items',
        'guest_products', 'guest_entitlements', 'guest_entitlement_usages', 'guest_notifications'
    ];
BEGIN
    FOREACH required_table IN ARRAY required_tables LOOP
        IF to_regclass('public.' || required_table) IS NULL THEN
            RAISE EXCEPTION 'Required table %.% is missing; Flyway baseline is incomplete', 'public', required_table;
        END IF;
    END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS open_bill_sync_queue (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    session_booking_id BIGINT,
    booking_group_key VARCHAR(64),
    due_at TIMESTAMP WITH TIME ZONE NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(1000),
    CONSTRAINT chk_open_bill_sync_queue_target CHECK (
        session_booking_id IS NOT NULL OR (booking_group_key IS NOT NULL AND trim(booking_group_key) <> '')
    ),
    CONSTRAINT fk_open_bill_sync_queue_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_open_bill_sync_queue_session
    ON open_bill_sync_queue (company_id, session_booking_id)
    WHERE session_booking_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_open_bill_sync_queue_group
    ON open_bill_sync_queue (company_id, booking_group_key)
    WHERE booking_group_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_open_bill_sync_queue_due
    ON open_bill_sync_queue (due_at ASC, id ASC);

CREATE INDEX IF NOT EXISTS idx_guest_notifications_user_company_created_id
    ON guest_notifications (guest_user_id, company_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_session_booking_company_client_start_id
    ON session_booking (company_id, client_id, start_time DESC, id DESC)
    WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_entitlements_client_company_status_created_id
    ON guest_entitlements (client_id, company_id, status, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_guest_entitlements_source_order_created_id
    ON guest_entitlements (source_order_id, created_at ASC, id ASC)
    WHERE source_order_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_entitlement_usages_entitlement_used_id
    ON guest_entitlement_usages (entitlement_id, used_at DESC, id DESC);

CREATE UNIQUE INDEX IF NOT EXISTS ux_companies_lower_tenant_code
    ON company (lower(tenant_code))
    WHERE tenant_code IS NOT NULL AND trim(tenant_code) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_app_settings_company_key
    ON app_settings (company_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_orders_reference_code
    ON guest_orders (reference_code)
    WHERE reference_code IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_entitlements_entitlement_code
    ON guest_entitlements (entitlement_code)
    WHERE entitlement_code IS NOT NULL AND trim(entitlement_code) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_entitlements_course_access_token
    ON guest_entitlements (course_access_token)
    WHERE course_access_token IS NOT NULL AND trim(course_access_token) <> '';

DO $$
BEGIN
    -- Check constraints: add when missing, then validate. Validation intentionally fails deployment on dirty data.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_session_booking_time_order') THEN
        ALTER TABLE session_booking ADD CONSTRAINT chk_session_booking_time_order CHECK (end_time > start_time) NOT VALID;
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT chk_session_booking_time_order;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bookable_slot_time_order')
       AND to_regclass('public.bookable_slot') IS NOT NULL THEN
        ALTER TABLE bookable_slot ADD CONSTRAINT chk_bookable_slot_time_order CHECK (end_time > start_time) NOT VALID;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bookable_slot_time_order') THEN
        ALTER TABLE bookable_slot VALIDATE CONSTRAINT chk_bookable_slot_time_order;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_guest_orders_amounts_non_negative') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT chk_guest_orders_amounts_non_negative
            CHECK (subtotal_gross >= 0 AND tax_amount >= 0 AND total_gross >= 0) NOT VALID;
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT chk_guest_orders_amounts_non_negative;
END $$;

DO $$
BEGIN
    -- Core ownership and booking relations.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_company') THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE users VALIDATE CONSTRAINT fk_users_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_company') THEN
        ALTER TABLE clients ADD CONSTRAINT fk_clients_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE clients VALIDATE CONSTRAINT fk_clients_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_assigned_to') THEN
        ALTER TABLE clients ADD CONSTRAINT fk_clients_assigned_to FOREIGN KEY (assigned_to_id) REFERENCES users(id) NOT VALID;
    END IF;
    ALTER TABLE clients VALIDATE CONSTRAINT fk_clients_assigned_to;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_company') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_client') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_client FOREIGN KEY (client_id) REFERENCES clients(id) NOT VALID;
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_client;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_consultant') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_consultant FOREIGN KEY (consultant_id) REFERENCES users(id) NOT VALID;
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_consultant;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_type') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_type FOREIGN KEY (type_id) REFERENCES session_type(id) NOT VALID;
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_type;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_space') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_space FOREIGN KEY (space_id) REFERENCES space(id) NOT VALID;
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_space;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_type_company') THEN
        ALTER TABLE session_type ADD CONSTRAINT fk_session_type_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE session_type VALIDATE CONSTRAINT fk_session_type_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_space_company') THEN
        ALTER TABLE space ADD CONSTRAINT fk_space_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE space VALIDATE CONSTRAINT fk_space_company;
END $$;

DO $$
BEGIN
    -- Billing and open-bill relations.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_methods_company') THEN
        ALTER TABLE payment_methods ADD CONSTRAINT fk_payment_methods_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE payment_methods VALIDATE CONSTRAINT fk_payment_methods_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transaction_service_company') THEN
        ALTER TABLE transaction_service ADD CONSTRAINT fk_transaction_service_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE transaction_service VALIDATE CONSTRAINT fk_transaction_service_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_type_transaction_services_session_type') THEN
        ALTER TABLE type_transaction_services ADD CONSTRAINT fk_type_transaction_services_session_type FOREIGN KEY (session_type_id) REFERENCES session_type(id) NOT VALID;
    END IF;
    ALTER TABLE type_transaction_services VALIDATE CONSTRAINT fk_type_transaction_services_session_type;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_type_transaction_services_transaction_service') THEN
        ALTER TABLE type_transaction_services ADD CONSTRAINT fk_type_transaction_services_transaction_service FOREIGN KEY (transaction_service_id) REFERENCES transaction_service(id) NOT VALID;
    END IF;
    ALTER TABLE type_transaction_services VALIDATE CONSTRAINT fk_type_transaction_services_transaction_service;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_company') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_client') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_client FOREIGN KEY (client_id) REFERENCES clients(id) NOT VALID;
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_client;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_consultant') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_consultant FOREIGN KEY (consultant_id) REFERENCES users(id) NOT VALID;
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_consultant;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_payment_method') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id) NOT VALID;
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_payment_method;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_session_booking') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_session_booking FOREIGN KEY (session_booking_id) REFERENCES session_booking(id) NOT VALID;
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_session_booking;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bill_items_open_bill') THEN
        ALTER TABLE open_bill_items ADD CONSTRAINT fk_open_bill_items_open_bill FOREIGN KEY (open_bill_id) REFERENCES open_bills(id) ON DELETE CASCADE NOT VALID;
    END IF;
    ALTER TABLE open_bill_items VALIDATE CONSTRAINT fk_open_bill_items_open_bill;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bill_items_transaction_service') THEN
        ALTER TABLE open_bill_items ADD CONSTRAINT fk_open_bill_items_transaction_service FOREIGN KEY (transaction_service_id) REFERENCES transaction_service(id) NOT VALID;
    END IF;
    ALTER TABLE open_bill_items VALIDATE CONSTRAINT fk_open_bill_items_transaction_service;
END $$;

DO $$
BEGIN
    -- Guest app order/wallet/notification relations.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_orders_company') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT fk_guest_orders_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT fk_guest_orders_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_orders_client') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT fk_guest_orders_client FOREIGN KEY (client_id) REFERENCES clients(id) NOT VALID;
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT fk_guest_orders_client;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_orders_guest_user') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT fk_guest_orders_guest_user FOREIGN KEY (guest_user_id) REFERENCES guest_users(id) NOT VALID;
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT fk_guest_orders_guest_user;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_orders_bill') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT fk_guest_orders_bill FOREIGN KEY (bill_id) REFERENCES bills(id) NOT VALID;
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT fk_guest_orders_bill;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_order_items_order') THEN
        ALTER TABLE guest_order_items ADD CONSTRAINT fk_guest_order_items_order FOREIGN KEY (order_id) REFERENCES guest_orders(id) ON DELETE CASCADE NOT VALID;
    END IF;
    ALTER TABLE guest_order_items VALIDATE CONSTRAINT fk_guest_order_items_order;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_order_items_product') THEN
        ALTER TABLE guest_order_items ADD CONSTRAINT fk_guest_order_items_product FOREIGN KEY (product_id) REFERENCES guest_products(id) NOT VALID;
    END IF;
    ALTER TABLE guest_order_items VALIDATE CONSTRAINT fk_guest_order_items_product;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_products_company') THEN
        ALTER TABLE guest_products ADD CONSTRAINT fk_guest_products_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE guest_products VALIDATE CONSTRAINT fk_guest_products_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_products_session_type') THEN
        ALTER TABLE guest_products ADD CONSTRAINT fk_guest_products_session_type FOREIGN KEY (session_type_id) REFERENCES session_type(id) NOT VALID;
    END IF;
    ALTER TABLE guest_products VALIDATE CONSTRAINT fk_guest_products_session_type;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_products_transaction_service') THEN
        ALTER TABLE guest_products ADD CONSTRAINT fk_guest_products_transaction_service FOREIGN KEY (transaction_service_id) REFERENCES transaction_service(id) NOT VALID;
    END IF;
    ALTER TABLE guest_products VALIDATE CONSTRAINT fk_guest_products_transaction_service;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlements_company') THEN
        ALTER TABLE guest_entitlements ADD CONSTRAINT fk_guest_entitlements_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE guest_entitlements VALIDATE CONSTRAINT fk_guest_entitlements_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlements_client') THEN
        ALTER TABLE guest_entitlements ADD CONSTRAINT fk_guest_entitlements_client FOREIGN KEY (client_id) REFERENCES clients(id) NOT VALID;
    END IF;
    ALTER TABLE guest_entitlements VALIDATE CONSTRAINT fk_guest_entitlements_client;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlements_product') THEN
        ALTER TABLE guest_entitlements ADD CONSTRAINT fk_guest_entitlements_product FOREIGN KEY (product_id) REFERENCES guest_products(id) NOT VALID;
    END IF;
    ALTER TABLE guest_entitlements VALIDATE CONSTRAINT fk_guest_entitlements_product;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlements_source_order') THEN
        ALTER TABLE guest_entitlements ADD CONSTRAINT fk_guest_entitlements_source_order FOREIGN KEY (source_order_id) REFERENCES guest_orders(id) NOT VALID;
    END IF;
    ALTER TABLE guest_entitlements VALIDATE CONSTRAINT fk_guest_entitlements_source_order;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlement_usages_entitlement') THEN
        ALTER TABLE guest_entitlement_usages ADD CONSTRAINT fk_guest_entitlement_usages_entitlement FOREIGN KEY (entitlement_id) REFERENCES guest_entitlements(id) NOT VALID;
    END IF;
    ALTER TABLE guest_entitlement_usages VALIDATE CONSTRAINT fk_guest_entitlement_usages_entitlement;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlement_usages_session') THEN
        ALTER TABLE guest_entitlement_usages ADD CONSTRAINT fk_guest_entitlement_usages_session FOREIGN KEY (session_booking_id) REFERENCES session_booking(id) NOT VALID;
    END IF;
    ALTER TABLE guest_entitlement_usages VALIDATE CONSTRAINT fk_guest_entitlement_usages_session;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_notifications_guest_user') THEN
        ALTER TABLE guest_notifications ADD CONSTRAINT fk_guest_notifications_guest_user FOREIGN KEY (guest_user_id) REFERENCES guest_users(id) ON DELETE CASCADE NOT VALID;
    END IF;
    ALTER TABLE guest_notifications VALIDATE CONSTRAINT fk_guest_notifications_guest_user;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_notifications_company') THEN
        ALTER TABLE guest_notifications ADD CONSTRAINT fk_guest_notifications_company FOREIGN KEY (company_id) REFERENCES company(id) NOT VALID;
    END IF;
    ALTER TABLE guest_notifications VALIDATE CONSTRAINT fk_guest_notifications_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_notifications_client') THEN
        ALTER TABLE guest_notifications ADD CONSTRAINT fk_guest_notifications_client FOREIGN KEY (client_id) REFERENCES clients(id) NOT VALID;
    END IF;
    ALTER TABLE guest_notifications VALIDATE CONSTRAINT fk_guest_notifications_client;
END $$;
