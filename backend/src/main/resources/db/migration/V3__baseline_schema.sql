-- Full Flyway baseline schema for clean staging/production PostgreSQL databases.
-- This migration is intentionally CREATE TABLE IF NOT EXISTS so it is safe on existing databases that were created before Flyway was introduced.
-- Existing environments should still be validated against a clean staging restore before production launch.

-- backend/src/main/java/com/example/app/admin/PlatformTenancyAdminAuditLog.java
CREATE TABLE IF NOT EXISTS platform_tenancy_admin_audit_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    actor_user_id BIGINT NOT NULL,
    action_type VARCHAR(64) NOT NULL,
    summary VARCHAR(500) NOT NULL,
    detail TEXT,
    reason TEXT
);

-- backend/src/main/java/com/example/app/auth/PasswordResetToken.java
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id BIGINT NOT NULL,
    token VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/auth/SignupEmailIntent.java
CREATE TABLE IF NOT EXISTS signup_email_intents (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    token VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL,
    payload_json TEXT NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    active BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/billing/AdvanceAllocation.java
CREATE TABLE IF NOT EXISTS advance_allocations (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    advance_bill_id BIGINT NOT NULL,
    open_bill_id BIGINT NOT NULL,
    session_booking_id BIGINT NOT NULL,
    transaction_service_id BIGINT NOT NULL,
    amount_net NUMERIC(19, 4) NOT NULL
);

-- backend/src/main/java/com/example/app/billing/Bill.java
CREATE TABLE IF NOT EXISTS bills (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    bill_number VARCHAR(255) NOT NULL,
    order_id VARCHAR(160),
    order_counter BIGINT,
    bill_type VARCHAR(16) NOT NULL,
    client_id BIGINT,
    client_first_name_snapshot VARCHAR(255) NOT NULL,
    client_last_name_snapshot VARCHAR(255) NOT NULL,
    recipient_type_snapshot VARCHAR(255),
    recipient_person_email_snapshot VARCHAR(255),
    recipient_company_id_snapshot BIGINT,
    recipient_company_name_snapshot VARCHAR(255),
    recipient_company_address_snapshot VARCHAR(255),
    recipient_company_postal_code_snapshot VARCHAR(255),
    recipient_company_city_snapshot VARCHAR(255),
    recipient_company_vat_id_snapshot VARCHAR(255),
    recipient_company_iban_snapshot VARCHAR(255),
    recipient_company_email_snapshot VARCHAR(255),
    recipient_company_telephone_snapshot VARCHAR(255),
    source_session_id_snapshot BIGINT,
    payment_method_id BIGINT,
    consultant_id BIGINT NOT NULL,
    issue_date DATE NOT NULL,
    total_net NUMERIC(19, 4) NOT NULL,
    total_gross NUMERIC(19, 4) NOT NULL,
    payment_status VARCHAR(255) NOT NULL,
    checkout_session_id VARCHAR(255),
    checkout_session_expires_at TIMESTAMP WITH TIME ZONE,
    payment_intent_id VARCHAR(255),
    stripe_connected_account_id VARCHAR(255),
    stripe_connect_mode VARCHAR(32),
    stripe_customer_id VARCHAR(255),
    stripe_invoice_id VARCHAR(255),
    stripe_invoice_number VARCHAR(255),
    stripe_bank_transfer_iban VARCHAR(255),
    stripe_bank_transfer_bic VARCHAR(255),
    stripe_bank_transfer_account_holder_name VARCHAR(255),
    stripe_bank_transfer_account_holder_address_line1 VARCHAR(255),
    stripe_bank_transfer_account_holder_postal_code VARCHAR(255),
    stripe_bank_transfer_account_holder_city VARCHAR(255),
    stripe_bank_transfer_account_holder_country VARCHAR(255),
    stripe_bank_transfer_reference VARCHAR(255),
    bank_transfer_reference VARCHAR(255),
    refund_of_bill_id BIGINT,
    refund_reference VARCHAR(255),
    stripe_hosted_invoice_url VARCHAR(2048),
    paid_at TIMESTAMP WITH TIME ZONE,
    fiscal_status VARCHAR(255) NOT NULL,
    fiscal_zoi VARCHAR(255),
    fiscal_eor VARCHAR(255),
    fiscal_qr TEXT,
    fiscal_message_id VARCHAR(255),
    fiscal_attempt_count INTEGER,
    fiscal_last_error TEXT,
    fiscal_log_json TEXT,
    fiscal_request_body TEXT,
    fiscal_response_body TEXT,
    invoice_pdf_object_key VARCHAR(1024),
    invoice_locale VARCHAR(8)
);

-- backend/src/main/java/com/example/app/billing/BillItem.java
CREATE TABLE IF NOT EXISTS bill_item (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    bill_id BIGINT NOT NULL,
    transaction_service_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL,
    net_price NUMERIC(19, 4) NOT NULL,
    gross_price NUMERIC(19, 4) NOT NULL,
    invoice_line_description VARCHAR(512),
    source_session_booking_id BIGINT,
    source_advance_bill_id BIGINT
);

-- backend/src/main/java/com/example/app/billing/BillPayment.java
CREATE TABLE IF NOT EXISTS bill_payments (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    bill_id BIGINT NOT NULL,
    payment_method_id BIGINT NOT NULL,
    amount_gross NUMERIC(19, 4) NOT NULL,
    sort_order INTEGER NOT NULL,
    source_advance_bill_id BIGINT
);

-- backend/src/main/java/com/example/app/billing/OpenBill.java
CREATE TABLE IF NOT EXISTS open_bills (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    consultant_id BIGINT NOT NULL,
    payment_method_id BIGINT,
    reference VARCHAR(255),
    session_booking_id BIGINT,
    batch_scope VARCHAR(16) NOT NULL,
    batch_target_client_id BIGINT,
    batch_target_company_id BIGINT,
    manual_split_locked BOOLEAN NOT NULL,
    manual_session_numbers_csv VARCHAR(255),
    manual_session_number_max BIGINT,
    bill_type VARCHAR(16),
    booking_group_key VARCHAR(64),
    discount_type VARCHAR(16),
    discount_value NUMERIC(19, 4),
    discount_item_index INTEGER,
    whole_bill_discount_percent NUMERIC(19, 4),
    item_discounts_json TEXT,
    proforma_number VARCHAR(80),
    proforma_sequence_number BIGINT,
    source_guest_order_id BIGINT
);

-- backend/src/main/java/com/example/app/billing/OpenBillItem.java
CREATE TABLE IF NOT EXISTS open_bill_items (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    open_bill_id BIGINT NOT NULL,
    transaction_service_id BIGINT NOT NULL,
    quantity INTEGER NOT NULL,
    net_price NUMERIC(19, 4) NOT NULL,
    unit_gross_price NUMERIC(19, 4),
    invoice_line_description VARCHAR(512),
    source_session_booking_id BIGINT,
    source_advance_bill_id BIGINT
);

-- backend/src/main/java/com/example/app/billing/OpenBillPayment.java
CREATE TABLE IF NOT EXISTS open_bill_payments (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    open_bill_id BIGINT NOT NULL,
    payment_method_id BIGINT NOT NULL,
    amount_gross NUMERIC(19, 4) NOT NULL,
    sort_order INTEGER NOT NULL,
    source_advance_bill_id BIGINT
);

-- backend/src/main/java/com/example/app/billing/PaymentMethod.java
CREATE TABLE IF NOT EXISTS payment_methods (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    payment_type VARCHAR(255) NOT NULL,
    fiscalized BOOLEAN NOT NULL,
    stripe_enabled BOOLEAN NOT NULL,
    guest_enabled BOOLEAN NOT NULL,
    widget_enabled BOOLEAN NOT NULL,
    guest_display_order INTEGER NOT NULL,
    allowed_guest_product_types_json VARCHAR(255)
);

-- backend/src/main/java/com/example/app/billing/TransactionService.java
CREATE TABLE IF NOT EXISTS transaction_service (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    code VARCHAR(12) NOT NULL,
    description VARCHAR(255) NOT NULL,
    tax_rate VARCHAR(255) NOT NULL,
    net_price NUMERIC(19, 4) NOT NULL,
    active BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/client/Client.java
CREATE TABLE IF NOT EXISTS clients (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    slovenian_locale VARCHAR(255),
    company_id BIGINT NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(255),
    whatsapp_phone VARCHAR(255),
    whatsapp_opt_in BOOLEAN NOT NULL,
    viber_user_id VARCHAR(255),
    viber_connected BOOLEAN NOT NULL,
    anonymized BOOLEAN NOT NULL,
    anonymized_at TIMESTAMP WITH TIME ZONE,
    anonymized_by_user_id BIGINT,
    active BOOLEAN NOT NULL,
    batch_payment_enabled BOOLEAN NOT NULL,
    inbox_starred BOOLEAN NOT NULL,
    inbox_closed BOOLEAN NOT NULL,
    assigned_to_id BIGINT,
    billing_company_id BIGINT,
    invoice_recipient_type VARCHAR(16) NOT NULL,
    invoice_person_address_line VARCHAR(255),
    invoice_person_postal_code VARCHAR(255),
    invoice_person_city VARCHAR(255),
    invoice_company_name VARCHAR(255),
    invoice_company_address_line VARCHAR(255),
    invoice_company_postal_code VARCHAR(255),
    invoice_company_city VARCHAR(255),
    invoice_company_vat_id VARCHAR(255)
);

-- backend/src/main/java/com/example/app/client/PreferredSlot.java
CREATE TABLE IF NOT EXISTS preferred_slot (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_id BIGINT NOT NULL,
    day_of_week VARCHAR(255),
    start_time TIME,
    end_time TIME
);

-- backend/src/main/java/com/example/app/company/ClientCompany.java
CREATE TABLE IF NOT EXISTS client_companies (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    owner_company_id BIGINT NOT NULL,
    platform_tenant_company_id BIGINT,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(255),
    postal_code VARCHAR(255),
    city VARCHAR(255),
    vat_id VARCHAR(255),
    iban VARCHAR(255),
    email VARCHAR(255),
    telephone VARCHAR(255),
    active BOOLEAN NOT NULL,
    batch_payment_enabled BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/company/Company.java
CREATE TABLE IF NOT EXISTS company (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    name VARCHAR(255) NOT NULL,
    tenant_code VARCHAR(64),
    paypal_merchant_id VARCHAR(255),
    paypal_tracking_id VARCHAR(255),
    paypal_onboarding_status VARCHAR(64),
    paypal_payments_receivable BOOLEAN,
    paypal_primary_email_confirmed BOOLEAN
);

-- backend/src/main/java/com/example/app/consumables/Consumable.java
CREATE TABLE IF NOT EXISTS consumable (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    category_id BIGINT,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    sku VARCHAR(80),
    barcode VARCHAR(80),
    unit VARCHAR(32) NOT NULL,
    location VARCHAR(120),
    current_stock NUMERIC(19, 4) NOT NULL,
    minimum_stock NUMERIC(19, 4) NOT NULL,
    cost_price NUMERIC(19, 4) NOT NULL,
    sale_price NUMERIC(19, 4),
    vat_rate_id BIGINT,
    track_stock BOOLEAN NOT NULL,
    billable BOOLEAN NOT NULL,
    active BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/consumables/ConsumableCategory.java
CREATE TABLE IF NOT EXISTS consumable_category (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    color VARCHAR(32),
    active BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/consumables/ConsumablePurchaseOrder.java
CREATE TABLE IF NOT EXISTS consumable_purchase_order (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    order_number VARCHAR(64) NOT NULL,
    supplier_id BIGINT,
    status VARCHAR(32) NOT NULL,
    order_date DATE,
    expected_date DATE,
    total_amount NUMERIC(19, 4) NOT NULL,
    received_amount NUMERIC(19, 4) NOT NULL,
    notes TEXT
);

-- backend/src/main/java/com/example/app/consumables/ConsumableStockMovement.java
CREATE TABLE IF NOT EXISTS consumable_stock_movement (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    movement_type VARCHAR(40) NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_id BIGINT,
    quantity_delta NUMERIC(19, 4) NOT NULL,
    stock_before NUMERIC(19, 4) NOT NULL,
    stock_after NUMERIC(19, 4) NOT NULL,
    unit_cost_snapshot NUMERIC(19, 4) NOT NULL,
    value_delta NUMERIC(19, 4),
    note TEXT,
    created_by_id BIGINT
);

-- backend/src/main/java/com/example/app/consumables/ConsumableSupplier.java
CREATE TABLE IF NOT EXISTS consumable_supplier (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(180) NOT NULL,
    contact_name VARCHAR(160),
    phone VARCHAR(80),
    email VARCHAR(180),
    categories VARCHAR(255),
    payment_terms_days INTEGER NOT NULL,
    reliability_percent INTEGER NOT NULL,
    outstanding_amount NUMERIC(19, 4),
    status VARCHAR(24) NOT NULL
);

-- backend/src/main/java/com/example/app/consumables/ServiceTypeConsumable.java
CREATE TABLE IF NOT EXISTS service_type_consumable (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    session_type_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    default_quantity NUMERIC(19, 4) NOT NULL,
    quantity_mode VARCHAR(32) NOT NULL,
    billable_override BOOLEAN,
    notes TEXT
);

-- backend/src/main/java/com/example/app/consumables/SessionConsumable.java
CREATE TABLE IF NOT EXISTS session_consumable (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    session_booking_id BIGINT NOT NULL,
    booking_group_key VARCHAR(64) NOT NULL,
    service_type_id BIGINT,
    consumable_id BIGINT NOT NULL,
    quantity NUMERIC(19, 4) NOT NULL,
    unit VARCHAR(32) NOT NULL,
    quantity_mode VARCHAR(32) NOT NULL,
    cost_price_snapshot NUMERIC(19, 4) NOT NULL,
    sale_price_snapshot NUMERIC(19, 4),
    billable BOOLEAN NOT NULL,
    source VARCHAR(32) NOT NULL,
    manually_changed BOOLEAN NOT NULL,
    notes TEXT
);

-- backend/src/main/java/com/example/app/course/Course.java
CREATE TABLE IF NOT EXISTS courses (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    guest_product_id BIGINT,
    title VARCHAR(180) NOT NULL,
    description TEXT,
    media_type VARCHAR(16) NOT NULL,
    status VARCHAR(24) NOT NULL,
    price_gross NUMERIC(19, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    active BOOLEAN NOT NULL,
    guest_visible BOOLEAN NOT NULL,
    sort_order INTEGER NOT NULL,
    thumbnail_url VARCHAR(512),
    bunny_library_id VARCHAR(96),
    bunny_library_name VARCHAR(180),
    bunny_video_id VARCHAR(96),
    bunny_storage_path VARCHAR(512),
    bunny_cdn_url VARCHAR(512),
    duration_seconds INTEGER,
    file_name VARCHAR(255),
    content_type VARCHAR(120),
    metadata_json TEXT
);

-- backend/src/main/java/com/example/app/course/MembershipCourse.java
CREATE TABLE IF NOT EXISTS membership_courses (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    membership_product_id BIGINT NOT NULL,
    course_id BIGINT NOT NULL
);

-- backend/src/main/java/com/example/app/files/ClientFile.java
CREATE TABLE IF NOT EXISTS client_files (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    client_id BIGINT NOT NULL,
    owner_company_id BIGINT NOT NULL,
    original_file_name VARCHAR(512) NOT NULL,
    content_type VARCHAR(255),
    size_bytes BIGINT NOT NULL,
    s3_object_key VARCHAR(1024) NOT NULL,
    uploaded_by_user_id BIGINT,
    uploaded_by_guest_user_id BIGINT,
    pending_inbox_attachment BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/files/CompanyFile.java
CREATE TABLE IF NOT EXISTS company_files (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    owner_company_id BIGINT NOT NULL,
    original_file_name VARCHAR(512) NOT NULL,
    content_type VARCHAR(255),
    size_bytes BIGINT NOT NULL,
    s3_object_key VARCHAR(1024) NOT NULL,
    uploaded_by_user_id BIGINT
);

-- backend/src/main/java/com/example/app/fiscal/FiscalCertificate.java
CREATE TABLE IF NOT EXISTS fiscal_certificates (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    file_name VARCHAR(255) NOT NULL,
    content_type VARCHAR(255) NOT NULL
);

-- backend/src/main/java/com/example/app/google/GoogleOAuthToken.java
CREATE TABLE IF NOT EXISTS google_oauth_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    access_token VARCHAR(2000) NOT NULL,
    refresh_token VARCHAR(2000),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- backend/src/main/java/com/example/app/google/calendar/GoogleCalendarConnection.java
CREATE TABLE IF NOT EXISTS google_calendar_connections (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    user_id BIGINT,
    google_account_email VARCHAR(512),
    calendar_id VARCHAR(1024) NOT NULL,
    calendar_summary VARCHAR(512),
    sync_direction VARCHAR(32) NOT NULL,
    allow_google_to_modify_bookings BOOLEAN NOT NULL,
    booking_delete_policy VARCHAR(32) NOT NULL,
    import_google_events_as VARCHAR(32) NOT NULL,
    access_token VARCHAR(4000) NOT NULL,
    refresh_token VARCHAR(4000),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scopes VARCHAR(1000),
    sync_token VARCHAR(4000),
    channel_id VARCHAR(128),
    resource_id VARCHAR(512),
    channel_expires_at TIMESTAMP WITH TIME ZONE,
    last_full_sync_at TIMESTAMP WITH TIME ZONE,
    last_incremental_sync_at TIMESTAMP WITH TIME ZONE,
    status VARCHAR(32) NOT NULL,
    last_error VARCHAR(2000)
);

-- backend/src/main/java/com/example/app/google/calendar/GoogleCalendarEventLink.java
CREATE TABLE IF NOT EXISTS google_calendar_event_links (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    connection_id BIGINT NOT NULL,
    calendar_id VARCHAR(1024) NOT NULL,
    google_event_id VARCHAR(1024) NOT NULL,
    google_etag VARCHAR(512),
    google_ical_uid VARCHAR(512),
    google_updated_at TIMESTAMP WITH TIME ZONE,
    app_entity_type VARCHAR(32) NOT NULL,
    app_entity_id BIGINT NOT NULL,
    origin VARCHAR(20) NOT NULL,
    sync_status VARCHAR(32) NOT NULL,
    last_error VARCHAR(2000),
    last_synced_hash VARCHAR(128),
    last_synced_at TIMESTAMP WITH TIME ZONE,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- backend/src/main/java/com/example/app/google/calendar/GoogleCalendarSyncJob.java
CREATE TABLE IF NOT EXISTS google_calendar_sync_jobs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    connection_id BIGINT,
    app_entity_type VARCHAR(32),
    app_entity_id BIGINT,
    action VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    attempts INTEGER NOT NULL,
    next_attempt_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_error VARCHAR(2000)
);

-- backend/src/main/java/com/example/app/group/ClientGroup.java
CREATE TABLE IF NOT EXISTS client_groups (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    active BOOLEAN NOT NULL,
    batch_payment_enabled BOOLEAN NOT NULL,
    individual_payment_enabled BOOLEAN NOT NULL,
    billing_company_id BIGINT
);

-- backend/src/main/java/com/example/app/guest/auth/GuestPasswordResetToken.java
CREATE TABLE IF NOT EXISTS guest_password_reset_tokens (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    guest_user_id BIGINT NOT NULL,
    token VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE,
    verification_code_hash VARCHAR(128),
    failed_attempts INTEGER NOT NULL,
    code_verified_at TIMESTAMP WITH TIME ZONE,
    active BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/guest/model/GuestDeviceToken.java
CREATE TABLE IF NOT EXISTS guest_device_tokens (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    guest_user_id BIGINT NOT NULL,
    platform VARCHAR(16) NOT NULL,
    push_token VARCHAR(512) NOT NULL,
    locale VARCHAR(8),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- backend/src/main/java/com/example/app/guest/model/GuestEntitlement.java
CREATE TABLE IF NOT EXISTS guest_entitlements (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    source_order_id BIGINT NOT NULL,
    entitlement_type VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    remaining_uses INTEGER,
    remaining_value_gross NUMERIC(19, 4),
    valid_from TIMESTAMP WITH TIME ZONE NOT NULL,
    valid_until TIMESTAMP WITH TIME ZONE,
    entitlement_code VARCHAR(32),
    visit_count INTEGER NOT NULL,
    display_code VARCHAR(32),
    display_seq INTEGER,
    course_access_token VARCHAR(64),
    metadata_json TEXT
);

-- backend/src/main/java/com/example/app/guest/model/GuestEntitlementUsage.java
CREATE TABLE IF NOT EXISTS guest_entitlement_usages (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    entitlement_id BIGINT NOT NULL,
    session_booking_id BIGINT,
    units_used INTEGER NOT NULL,
    reason VARCHAR(64) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE NOT NULL,
    scan_source VARCHAR(16),
    scanned_by_user_id BIGINT,
    units_before INTEGER,
    units_after INTEGER
);

-- backend/src/main/java/com/example/app/guest/model/GuestNotification.java
CREATE TABLE IF NOT EXISTS guest_notifications (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    guest_user_id BIGINT NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT,
    notification_type VARCHAR(40) NOT NULL,
    title VARCHAR(200) NOT NULL,
    body TEXT NOT NULL,
    payload_json TEXT,
    read_at TIMESTAMP WITH TIME ZONE
);

-- backend/src/main/java/com/example/app/guest/model/GuestOrder.java
CREATE TABLE IF NOT EXISTS guest_orders (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    guest_user_id BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    payment_method_type VARCHAR(32) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    subtotal_gross NUMERIC(19, 4) NOT NULL,
    tax_amount NUMERIC(19, 4) NOT NULL,
    total_gross NUMERIC(19, 4) NOT NULL,
    reference_code VARCHAR(120) NOT NULL,
    stripe_checkout_session_id VARCHAR(255),
    stripe_payment_intent_id VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    stripe_connected_account_id VARCHAR(255),
    stripe_connect_mode VARCHAR(32),
    metadata_json TEXT,
    paypal_order_id VARCHAR(255),
    paypal_capture_id VARCHAR(255),
    bill_id BIGINT,
    invoice_locale VARCHAR(8),
    paid_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE
);

-- backend/src/main/java/com/example/app/guest/model/GuestOrderItem.java
CREATE TABLE IF NOT EXISTS guest_order_items (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    session_type_id BIGINT,
    quantity INTEGER NOT NULL,
    unit_price_gross NUMERIC(19, 4) NOT NULL,
    line_total_gross NUMERIC(19, 4) NOT NULL,
    metadata_json TEXT
);

-- backend/src/main/java/com/example/app/guest/model/GuestProduct.java
CREATE TABLE IF NOT EXISTS guest_products (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    session_type_id BIGINT,
    transaction_service_id BIGINT,
    course_id BIGINT,
    name VARCHAR(160) NOT NULL,
    description TEXT,
    promo_text VARCHAR(120),
    product_type VARCHAR(32) NOT NULL,
    price_gross NUMERIC(19, 4) NOT NULL,
    currency VARCHAR(3) NOT NULL,
    active BOOLEAN NOT NULL,
    guest_visible BOOLEAN NOT NULL,
    bookable BOOLEAN NOT NULL,
    usage_limit INTEGER,
    validity_days INTEGER,
    auto_renews BOOLEAN NOT NULL,
    sort_order INTEGER NOT NULL,
    booking_rules_json TEXT,
    entitlement_rules_json TEXT
);

-- backend/src/main/java/com/example/app/guest/model/GuestTenantLink.java
CREATE TABLE IF NOT EXISTS guest_tenant_links (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    guest_user_id BIGINT NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    status VARCHAR(32) NOT NULL,
    joined_via VARCHAR(32) NOT NULL,
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    guest_inbox_last_read_at TIMESTAMP WITH TIME ZONE,
    staff_inbox_last_read_at TIMESTAMP WITH TIME ZONE
);

-- backend/src/main/java/com/example/app/guest/model/GuestUser.java
CREATE TABLE IF NOT EXISTS guest_users (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255),
    first_name VARCHAR(120) NOT NULL,
    last_name VARCHAR(120) NOT NULL,
    phone VARCHAR(60),
    language VARCHAR(8) NOT NULL,
    active BOOLEAN NOT NULL,
    email_verified BOOLEAN NOT NULL,
    notify_messages_enabled BOOLEAN NOT NULL,
    notify_reminders_enabled BOOLEAN NOT NULL,
    google_subject VARCHAR(255),
    apple_subject VARCHAR(255),
    stripe_customer_id VARCHAR(255),
    profile_picture_s3_key VARCHAR(512),
    profile_picture_content_type VARCHAR(120),
    last_login_at TIMESTAMP WITH TIME ZONE
);

-- backend/src/main/java/com/example/app/guest/model/TenantInvite.java
CREATE TABLE IF NOT EXISTS tenant_invites (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    code VARCHAR(120) NOT NULL,
    label VARCHAR(120),
    active BOOLEAN NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    max_uses INTEGER,
    used_count INTEGER NOT NULL,
    created_by_user_id BIGINT
);

-- backend/src/main/java/com/example/app/inbox/ClientMessage.java
CREATE TABLE IF NOT EXISTS client_messages (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    sender_user_id BIGINT,
    guest_user_id BIGINT,
    channel VARCHAR(20) NOT NULL,
    direction VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    recipient VARCHAR(255) NOT NULL,
    subject VARCHAR(255),
    body TEXT NOT NULL,
    external_message_id VARCHAR(255),
    error_message VARCHAR(2000),
    conversation_key VARCHAR(80),
    conversation_closed BOOLEAN NOT NULL,
    conversation_starred BOOLEAN NOT NULL,
    internal_note BOOLEAN NOT NULL,
    sent_at TIMESTAMP WITH TIME ZONE
);

-- backend/src/main/java/com/example/app/inbox/ClientMessageAttachment.java
CREATE TABLE IF NOT EXISTS client_message_attachments (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    message_id BIGINT NOT NULL,
    client_file_id BIGINT NOT NULL
);

-- backend/src/main/java/com/example/app/inbox/ScheduledMessage.java
CREATE TABLE IF NOT EXISTS scheduled_messages (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    sender_user_id BIGINT,
    channel VARCHAR(20) NOT NULL,
    subject VARCHAR(255),
    body TEXT NOT NULL,
    next_run_at TIMESTAMP WITH TIME ZONE NOT NULL,
    recurrence VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL,
    last_run_at TIMESTAMP WITH TIME ZONE,
    last_error VARCHAR(2000)
);

-- backend/src/main/java/com/example/app/mfa/RecoveryCode.java
CREATE TABLE IF NOT EXISTS recovery_codes (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id BIGINT NOT NULL,
    code_hash VARCHAR(255) NOT NULL,
    code_hint VARCHAR(64) NOT NULL,
    used_at TIMESTAMP WITH TIME ZONE
);

-- backend/src/main/java/com/example/app/mfa/WebAuthnCredential.java
CREATE TABLE IF NOT EXISTS webauthn_credentials (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id BIGINT NOT NULL,
    credential_id VARCHAR(512) NOT NULL,
    public_key_cose TEXT NOT NULL,
    signature_count BIGINT NOT NULL,
    label VARCHAR(255),
    transports_json VARCHAR(255),
    discoverable BOOLEAN NOT NULL,
    backup_eligible BOOLEAN,
    backup_state BOOLEAN,
    last_used_at TIMESTAMP WITH TIME ZONE
);

-- backend/src/main/java/com/example/app/securitycenter/SecurityActivityEvent.java
CREATE TABLE IF NOT EXISTS security_activity_events (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id BIGINT NOT NULL,
    event_type VARCHAR(64) NOT NULL,
    title VARCHAR(160) NOT NULL,
    detail VARCHAR(500),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL,
    risk_level VARCHAR(64),
    ip_address VARCHAR(128),
    user_agent VARCHAR(500)
);

-- backend/src/main/java/com/example/app/securitycenter/SecurityAlertPreference.java
CREATE TABLE IF NOT EXISTS security_alert_preferences (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id BIGINT NOT NULL,
    factor_change_alerts_enabled BOOLEAN NOT NULL,
    suspicious_sign_in_alerts_enabled BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/securitycenter/UserSecuritySession.java
CREATE TABLE IF NOT EXISTS user_security_sessions (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    user_id BIGINT NOT NULL,
    session_key VARCHAR(64) NOT NULL,
    label VARCHAR(160),
    user_agent VARCHAR(500),
    ip_address VARCHAR(128),
    issued_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL,
    revoked_at TIMESTAMP WITH TIME ZONE,
    revoke_reason VARCHAR(128)
);

-- backend/src/main/java/com/example/app/session/BookableSlot.java
CREATE TABLE IF NOT EXISTS bookable_slot (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    day_of_week VARCHAR(255) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    consultant_id BIGINT NOT NULL,
    indefinite BOOLEAN NOT NULL,
    start_date DATE,
    end_date DATE
);

-- backend/src/main/java/com/example/app/session/CalendarTodo.java
CREATE TABLE IF NOT EXISTS calendar_todos (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    owner_id BIGINT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    task VARCHAR(200) NOT NULL,
    notes VARCHAR(1000)
);

-- backend/src/main/java/com/example/app/session/PersonalCalendarBlock.java
CREATE TABLE IF NOT EXISTS personal_calendar_block (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    owner_id BIGINT NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    task VARCHAR(200) NOT NULL,
    notes VARCHAR(1000)
);

-- backend/src/main/java/com/example/app/session/SessionBooking.java
CREATE TABLE IF NOT EXISTS session_booking (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT,
    booking_group_key VARCHAR(64),
    consultant_id BIGINT,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    space_id BIGINT,
    type_id BIGINT,
    notes VARCHAR(1000),
    meeting_link VARCHAR(500),
    meeting_provider VARCHAR(20),
    billed_at DATE,
    reminder_sent_at TIMESTAMP,
    notification_before_sent_at TIMESTAMP,
    notification_after_sent_at TIMESTAMP,
    booking_status VARCHAR(32),
    source_channel VARCHAR(32),
    source_order_id VARCHAR(64),
    guest_user_id VARCHAR(64),
    client_group_id BIGINT,
    session_group_email_override VARCHAR(512),
    session_group_billing_company_id BIGINT,
    payee_type VARCHAR(16),
    payee_company_id BIGINT,
    payee_custom_data BOOLEAN NOT NULL,
    payee_person_first_name VARCHAR(255),
    payee_person_last_name VARCHAR(255),
    payee_person_email VARCHAR(512),
    payee_company_name VARCHAR(255),
    payee_company_address VARCHAR(512),
    payee_company_city VARCHAR(255),
    payee_company_postal_code VARCHAR(64),
    payee_company_vat_id VARCHAR(64),
    payee_company_email VARCHAR(512)
);

-- backend/src/main/java/com/example/app/session/SessionType.java
CREATE TABLE IF NOT EXISTS session_type (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    duration_minutes INTEGER,
    break_minutes INTEGER,
    max_participants_per_session INTEGER,
    widget_group_booking_enabled BOOLEAN NOT NULL,
    guest_booking_enabled BOOLEAN NOT NULL,
    group_booking_enabled BOOLEAN NOT NULL,
    guest_limit_user_emails TEXT,
    price_calculation_mode VARCHAR(24) NOT NULL,
    guest_booking_description TEXT,
    guest_sort_order INTEGER NOT NULL,
    active BOOLEAN NOT NULL
);

-- backend/src/main/java/com/example/app/session/Space.java
CREATE TABLE IF NOT EXISTS space (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(255)
);

-- backend/src/main/java/com/example/app/session/TypeTransactionService.java
CREATE TABLE IF NOT EXISTS type_transaction_services (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    session_type_id BIGINT NOT NULL,
    transaction_service_id BIGINT NOT NULL,
    price NUMERIC(19, 4)
);

-- backend/src/main/java/com/example/app/settings/AppSetting.java
CREATE TABLE IF NOT EXISTS app_settings (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL
);

-- backend/src/main/java/com/example/app/stripe/StripeWebhookEvent.java
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    event_id VARCHAR(255) NOT NULL,
    event_type VARCHAR(255) NOT NULL,
    processing_status VARCHAR(255) NOT NULL,
    payload TEXT,
    error_message TEXT
);

-- backend/src/main/java/com/example/app/user/User.java
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL,
    consultant BOOLEAN NOT NULL,
    vat_id VARCHAR(64),
    phone VARCHAR(64),
    whatsapp_sender_number VARCHAR(64),
    whatsapp_phone_number_id VARCHAR(128),
    working_hours_json TEXT,
    webauthn_user_handle VARCHAR(255),
    factor_change_alerts_enabled BOOLEAN,
    suspicious_sign_in_alerts_enabled BOOLEAN,
    permissions_json TEXT,
    avatar_s3_key VARCHAR(512),
    avatar_content_type VARCHAR(120)
);

-- backend/src/main/java/com/example/app/widget/WidgetBookingIdempotencyRecord.java
CREATE TABLE IF NOT EXISTS widget_booking_idempotency (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    endpoint VARCHAR(80) NOT NULL,
    payload_hash VARCHAR(128) NOT NULL,
    response_json TEXT NOT NULL
);

-- backend/src/main/java/com/example/app/zoom/ZoomOAuthToken.java
CREATE TABLE IF NOT EXISTS zoom_oauth_tokens (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL,
    access_token VARCHAR(2000) NOT NULL,
    refresh_token VARCHAR(2000),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Explicit many-to-many join tables used by the JPA model.
CREATE TABLE IF NOT EXISTS user_spaces (
    user_id BIGINT NOT NULL,
    space_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, space_id)
);

CREATE TABLE IF NOT EXISTS user_types (
    user_id BIGINT NOT NULL,
    type_id BIGINT NOT NULL,
    PRIMARY KEY (user_id, type_id)
);

CREATE TABLE IF NOT EXISTS client_group_members (
    group_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    PRIMARY KEY (group_id, client_id)
);
