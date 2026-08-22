-- Calendra production Flyway baseline (V1).
--
-- Canonical schema for a NEW/EMPTY PostgreSQL database immediately before production launch.
-- The complete pre-production migration history was intentionally squashed into this file.
-- Do not use Flyway `baseline` on the new production database: let Flyway execute V1.
-- After production launch, never edit this migration; add V2, V3, ... migrations.
--
-- Pre-production-only objects intentionally excluded:
--   * the retired singular waitlist schema;
--   * workspace subscription source-history staging data;
--   * the session_consumable snapshot-fill repair trigger;
--   * one-time data repair/backfill statements.



-- ============================================================================
-- Baseline Schema
-- ============================================================================

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
    fiscal_sent_at TIMESTAMP WITH TIME ZONE,
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
    content_type VARCHAR(255) NOT NULL,
    certificate_data_bytes BYTEA
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
CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_device_tokens_push_token
    ON guest_device_tokens (push_token);
CREATE INDEX IF NOT EXISTS idx_guest_device_tokens_guest_updated
    ON guest_device_tokens (guest_user_id, updated_at DESC);

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
    notify_reminder_minutes INTEGER NOT NULL DEFAULT 60,
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
    notes VARCHAR(1000),
    visibility_scope VARCHAR(20) NOT NULL DEFAULT 'SELECTED',
    CONSTRAINT chk_calendar_todos_visibility_scope CHECK (visibility_scope IN ('SELECTED', 'ALL'))
);

CREATE INDEX IF NOT EXISTS idx_calendar_todos_company_time_visibility
    ON calendar_todos (company_id, start_time, visibility_scope);

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
    notes VARCHAR(1000),
    visible_to_admins BOOLEAN NOT NULL DEFAULT FALSE
);

-- backend/src/main/java/com/example/app/session/SessionBooking.java
CREATE TABLE IF NOT EXISTS session_booking (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT,
    booking_group_key VARCHAR(64),
    recurrence_series_key VARCHAR(64),
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

-- ============================================================================
-- Guest Booking Push Reminders
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_push_reminders (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    booking_id BIGINT NOT NULL,
    guest_user_id BIGINT NOT NULL,
    company_id BIGINT NOT NULL,
    client_id BIGINT NOT NULL,
    due_at TIMESTAMP NOT NULL,
    booking_start_at TIMESTAMP NOT NULL,
    reminder_minutes INTEGER NOT NULL,
    status VARCHAR(16) NOT NULL,
    sent_at TIMESTAMP,
    failed_at TIMESTAMP,
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error VARCHAR(1000)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_booking_push_reminders_booking_guest
    ON booking_push_reminders (booking_id, guest_user_id);
CREATE INDEX IF NOT EXISTS idx_booking_push_reminders_due
    ON booking_push_reminders (status, due_at, id);
CREATE INDEX IF NOT EXISTS idx_booking_push_reminders_guest_status
    ON booking_push_reminders (guest_user_id, status, due_at);
CREATE INDEX IF NOT EXISTS idx_booking_push_reminders_booking
    ON booking_push_reminders (booking_id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_push_reminders_booking') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT fk_booking_push_reminders_booking
            FOREIGN KEY (booking_id) REFERENCES session_booking(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_push_reminders_guest_user') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT fk_booking_push_reminders_guest_user
            FOREIGN KEY (guest_user_id) REFERENCES guest_users(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_push_reminders_company') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT fk_booking_push_reminders_company
            FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_push_reminders_client') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT fk_booking_push_reminders_client
            FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_guest_notify_reminder_minutes') THEN
        ALTER TABLE guest_users ADD CONSTRAINT chk_guest_notify_reminder_minutes
            CHECK (notify_reminder_minutes IN (5, 15, 30, 60, 180, 1440));
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_booking_push_reminder_minutes') THEN
        ALTER TABLE booking_push_reminders ADD CONSTRAINT chk_booking_push_reminder_minutes
            CHECK (reminder_minutes IN (5, 15, 30, 60, 180, 1440));
    END IF;
END $$;

-- backend/src/main/java/com/example/app/session/SessionType.java
CREATE TABLE IF NOT EXISTS session_type (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    description VARCHAR(255),
    color VARCHAR(20),
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

-- backend/src/main/java/com/example/app/user/EmployeeAccessRole.java
CREATE TABLE IF NOT EXISTS employee_access_roles (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    description VARCHAR(500),
    archived BOOLEAN NOT NULL DEFAULT FALSE,
    permissions_json TEXT
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
    employee_access_role_id BIGINT,
    avatar_s3_key VARCHAR(512),
    avatar_content_type VARCHAR(120)
);

CREATE TABLE IF NOT EXISTS client_assigned_users (
    client_id BIGINT NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    PRIMARY KEY (client_id, user_id)
);

-- backend/src/main/java/com/example/app/session/CalendarTodo.java visibleUsers join table
-- Must be created after both calendar_todos and users exist because it has FKs to both.
CREATE TABLE IF NOT EXISTS calendar_todo_visible_users (
    todo_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    PRIMARY KEY (todo_id, user_id),
    CONSTRAINT fk_calendar_todo_visible_users_todo
        FOREIGN KEY (todo_id) REFERENCES calendar_todos(id) ON DELETE CASCADE,
    CONSTRAINT fk_calendar_todo_visible_users_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_calendar_todo_visible_users_user
    ON calendar_todo_visible_users (user_id);

-- backend/src/main/java/com/example/app/widget/WidgetBookingIdempotencyRecord.java
CREATE TABLE IF NOT EXISTS widget_booking_idempotency (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL,
    endpoint VARCHAR(80) NOT NULL,
    payload_hash VARCHAR(128) NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS',
    response_json TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    failed_at TIMESTAMP WITH TIME ZONE,
    last_error VARCHAR(1000)
);


-- backend/src/main/java/com/example/app/widget/manage/PublicBookingManageToken.java
CREATE TABLE IF NOT EXISTS public_booking_manage_tokens (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    booking_id BIGINT NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_used_at TIMESTAMP WITH TIME ZONE,
    revoked_at TIMESTAMP WITH TIME ZONE
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


-- ============================================================================
-- Post Baseline Production Readiness Indexes And Constraints
-- ============================================================================

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
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_recurrence_series
                 ON session_booking (company_id, recurrence_series_key, start_time, id)
                 WHERE recurrence_series_key IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_source_order
                 ON session_booking (company_id, source_order_id)
                 WHERE source_order_id IS NOT NULL';

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_session_booking_time_order') THEN
            EXECUTE 'ALTER TABLE session_booking
                     ADD CONSTRAINT chk_session_booking_time_order CHECK (end_time > start_time)';
        END IF;
    END IF;

    IF to_regclass('public.bookable_slot') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookable_slot_company_day_consultant_dates
                 ON bookable_slot (company_id, day_of_week, consultant_id, start_date, end_date, start_time, end_time)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bookable_slot_consultant_company_day_time
                 ON bookable_slot (consultant_id, company_id, day_of_week, start_time, end_time)';

        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bookable_slot_time_order') THEN
            EXECUTE 'ALTER TABLE bookable_slot
                     ADD CONSTRAINT chk_bookable_slot_time_order CHECK (end_time > start_time)';
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
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_created_at
                 ON clients (company_id, created_at, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_assigned_created_at
                 ON clients (company_id, assigned_to_id, created_at, id)
                 WHERE assigned_to_id IS NOT NULL';
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
    IF to_regclass('public.idx_users_company_employee_access_role_active') IS NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_users_company_employee_access_role_active
                 ON users (company_id, employee_access_role_id, active)';
    END IF;
    IF to_regclass('public.idx_employee_access_roles_company_archived') IS NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_employee_access_roles_company_archived
                 ON employee_access_roles (company_id, archived, lower(name))';
    END IF;
    IF to_regclass('public.ux_employee_access_roles_company_lower_name_active') IS NULL THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ux_employee_access_roles_company_lower_name_active
                 ON employee_access_roles (company_id, lower(name)) WHERE archived = false';
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
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ux_bills_company_bill_number
                 ON bills (company_id, bill_number)';
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ux_bills_company_order_id
                 ON bills (company_id, order_id)
                 WHERE order_id IS NOT NULL';
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
                     CHECK (subtotal_gross >= 0 AND tax_amount >= 0 AND total_gross >= 0)';
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
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'widget_booking_idempotency' AND column_name = 'status'
        ) THEN
            ALTER TABLE widget_booking_idempotency ADD COLUMN status VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'widget_booking_idempotency' AND column_name = 'completed_at'
        ) THEN
            ALTER TABLE widget_booking_idempotency ADD COLUMN completed_at TIMESTAMP WITH TIME ZONE;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'widget_booking_idempotency' AND column_name = 'failed_at'
        ) THEN
            ALTER TABLE widget_booking_idempotency ADD COLUMN failed_at TIMESTAMP WITH TIME ZONE;
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'widget_booking_idempotency' AND column_name = 'last_error'
        ) THEN
            ALTER TABLE widget_booking_idempotency ADD COLUMN last_error VARCHAR(1000);
        END IF;
        ALTER TABLE widget_booking_idempotency ALTER COLUMN response_json DROP NOT NULL;
    END IF;

    IF to_regclass('public.public_booking_manage_tokens') IS NOT NULL THEN
        EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS ux_public_booking_manage_tokens_hash
                 ON public_booking_manage_tokens (token_hash)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_public_booking_manage_tokens_booking
                 ON public_booking_manage_tokens (booking_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_public_booking_manage_tokens_company
                 ON public_booking_manage_tokens (company_id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_public_booking_manage_tokens_active
                 ON public_booking_manage_tokens (token_hash, revoked_at, expires_at)';
    END IF;

    -- guest_device_tokens indexes are created directly after the table definition above.
    -- Do not create them again here, otherwise a clean production migration logs
    -- duplicate-index warnings even though the migration succeeds.
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_companies_lower_tenant_code
    ON company (lower(tenant_code))
    WHERE tenant_code IS NOT NULL AND trim(tenant_code) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_users_company_lower_email
    ON users (company_id, lower(email))
    WHERE email IS NOT NULL AND trim(email) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_app_settings_company_key
    ON app_settings (company_id, key);
CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_tenant_links_guest_company
    ON guest_tenant_links (guest_user_id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS ux_widget_booking_idempotency_company_key_endpoint
    ON widget_booking_idempotency (company_id, idempotency_key, endpoint);
CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_orders_reference_code
    ON guest_orders (reference_code)
    WHERE reference_code IS NOT NULL AND trim(reference_code) <> '';


-- ============================================================================
-- Scheduler Lock And Booking Range Indexes
-- ============================================================================

-- ShedLock table used by scheduled jobs in multi-instance staging/production deployments.
-- Keep this in Flyway so the application does not perform schema creation at runtime.
CREATE TABLE IF NOT EXISTS shedlock (
    name VARCHAR(255) NOT NULL,
    lock_until TIMESTAMP NOT NULL,
    locked_at TIMESTAMP NOT NULL,
    locked_by VARCHAR(255) NOT NULL,
    PRIMARY KEY (name)
);

-- Date-range endpoints now query bookings directly in PostgreSQL. These non-partial indexes cover
-- all statuses, including CANCELLED/NO_SHOW rows that the calendar may still need to display/filter.
DO $$
BEGIN
    IF to_regclass('public.session_booking') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_time_all
                 ON session_booking (company_id, start_time, end_time, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_session_booking_company_consultant_time_all
                 ON session_booking (company_id, consultant_id, start_time, end_time, id)
                 WHERE consultant_id IS NOT NULL';
    END IF;

    IF to_regclass('public.open_bills') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_open_bills_company_session_booking
                 ON open_bills (company_id, session_booking_id)
                 WHERE session_booking_id IS NOT NULL';
    END IF;

    IF to_regclass('public.open_bill_items') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_open_bill_items_source_session_booking
                 ON open_bill_items (source_session_booking_id, open_bill_id)
                 WHERE source_session_booking_id IS NOT NULL';
    END IF;
END $$;


-- ============================================================================
-- Pagination And Open Bill Sync Indexes
-- ============================================================================

-- Pagination and scale indexes used by production list endpoints.

DO $$
BEGIN
    IF to_regclass('public.clients') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_name_id ON clients (company_id, last_name, first_name, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_assigned_name_id ON clients (company_id, assigned_to_id, last_name, first_name, id) WHERE assigned_to_id IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_email_lower ON clients (company_id, lower(email)) WHERE email IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_phone ON clients (company_id, phone) WHERE phone IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_phone_digits
                 ON clients (company_id, regexp_replace(coalesce(phone, ''''), ''[^0-9]'', '''', ''g''))
                 WHERE phone IS NOT NULL AND trim(phone) <> ''''';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_clients_company_whatsapp_phone_digits
                 ON clients (company_id, regexp_replace(coalesce(whatsapp_phone, ''''), ''[^0-9]'', '''', ''g''))
                 WHERE whatsapp_phone IS NOT NULL AND trim(whatsapp_phone) <> ''''';
    END IF;

    IF to_regclass('public.bills') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bills_company_issue_date_id ON bills (company_id, issue_date DESC, id DESC)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bills_company_consultant_issue_date_id
                 ON bills (company_id, consultant_id, issue_date DESC, id DESC)
                 WHERE consultant_id IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bills_company_payment_status_id
                 ON bills (company_id, payment_status, id)';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bills_company_payment_method_status_id
                 ON bills (company_id, payment_method_id, payment_status, id)
                 WHERE payment_method_id IS NOT NULL';
    END IF;

    IF to_regclass('public.bill_item') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bill_item_source_session_booking
                 ON bill_item (source_session_booking_id, bill_id)
                 WHERE source_session_booking_id IS NOT NULL';
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bill_item_bill_id
                 ON bill_item (bill_id)';
    END IF;

    IF to_regclass('public.bill_payments') IS NOT NULL THEN
        EXECUTE 'CREATE INDEX IF NOT EXISTS idx_bill_payments_bill_method
                 ON bill_payments (bill_id, payment_method_id)';
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

CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_entitlements_entitlement_code
    ON guest_entitlements (entitlement_code)
    WHERE entitlement_code IS NOT NULL AND trim(entitlement_code) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_entitlements_course_access_token
    ON guest_entitlements (course_access_token)
    WHERE course_access_token IS NOT NULL AND trim(course_access_token) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_entitlements_gift_card_company_seq
    ON guest_entitlements (company_id, display_seq)
    WHERE entitlement_type = 'GIFT_CARD' AND display_seq IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_entitlements_gift_card_company_display_code
    ON guest_entitlements (company_id, lower(display_code))
    WHERE entitlement_type = 'GIFT_CARD' AND display_code IS NOT NULL AND trim(display_code) <> '';

DO $$
BEGIN
    -- Check constraints: add when missing, then validate. Validation intentionally fails deployment on dirty data.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_session_booking_time_order') THEN
        ALTER TABLE session_booking ADD CONSTRAINT chk_session_booking_time_order CHECK (end_time > start_time);
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT chk_session_booking_time_order;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bookable_slot_time_order')
       AND to_regclass('public.bookable_slot') IS NOT NULL THEN
        ALTER TABLE bookable_slot ADD CONSTRAINT chk_bookable_slot_time_order CHECK (end_time > start_time);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_bookable_slot_time_order') THEN
        ALTER TABLE bookable_slot VALIDATE CONSTRAINT chk_bookable_slot_time_order;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_guest_orders_amounts_non_negative') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT chk_guest_orders_amounts_non_negative
            CHECK (subtotal_gross >= 0 AND tax_amount >= 0 AND total_gross >= 0);
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT chk_guest_orders_amounts_non_negative;
END $$;

DO $$
BEGIN
    -- Core ownership and booking relations.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_employee_access_roles_company') THEN
        ALTER TABLE employee_access_roles ADD CONSTRAINT fk_employee_access_roles_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE employee_access_roles VALIDATE CONSTRAINT fk_employee_access_roles_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_company') THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE users VALIDATE CONSTRAINT fk_users_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_employee_access_role') THEN
        ALTER TABLE users ADD CONSTRAINT fk_users_employee_access_role FOREIGN KEY (employee_access_role_id) REFERENCES employee_access_roles(id);
    END IF;
    ALTER TABLE users VALIDATE CONSTRAINT fk_users_employee_access_role;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_company') THEN
        ALTER TABLE clients ADD CONSTRAINT fk_clients_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE clients VALIDATE CONSTRAINT fk_clients_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_assigned_to') THEN
        ALTER TABLE clients ADD CONSTRAINT fk_clients_assigned_to FOREIGN KEY (assigned_to_id) REFERENCES users(id);
    END IF;
    ALTER TABLE clients VALIDATE CONSTRAINT fk_clients_assigned_to;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_company') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_client') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_client FOREIGN KEY (client_id) REFERENCES clients(id);
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_client;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_consultant') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_consultant FOREIGN KEY (consultant_id) REFERENCES users(id);
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_consultant;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_type') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_type FOREIGN KEY (type_id) REFERENCES session_type(id);
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_type;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_space') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_space FOREIGN KEY (space_id) REFERENCES space(id);
    END IF;
    ALTER TABLE session_booking VALIDATE CONSTRAINT fk_session_booking_space;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_type_company') THEN
        ALTER TABLE session_type ADD CONSTRAINT fk_session_type_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE session_type VALIDATE CONSTRAINT fk_session_type_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_space_company') THEN
        ALTER TABLE space ADD CONSTRAINT fk_space_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE space VALIDATE CONSTRAINT fk_space_company;
END $$;

DO $$
BEGIN
    -- Billing and open-bill relations.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_payment_methods_company') THEN
        ALTER TABLE payment_methods ADD CONSTRAINT fk_payment_methods_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE payment_methods VALIDATE CONSTRAINT fk_payment_methods_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_transaction_service_company') THEN
        ALTER TABLE transaction_service ADD CONSTRAINT fk_transaction_service_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE transaction_service VALIDATE CONSTRAINT fk_transaction_service_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_type_transaction_services_session_type') THEN
        ALTER TABLE type_transaction_services ADD CONSTRAINT fk_type_transaction_services_session_type FOREIGN KEY (session_type_id) REFERENCES session_type(id);
    END IF;
    ALTER TABLE type_transaction_services VALIDATE CONSTRAINT fk_type_transaction_services_session_type;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_type_transaction_services_transaction_service') THEN
        ALTER TABLE type_transaction_services ADD CONSTRAINT fk_type_transaction_services_transaction_service FOREIGN KEY (transaction_service_id) REFERENCES transaction_service(id);
    END IF;
    ALTER TABLE type_transaction_services VALIDATE CONSTRAINT fk_type_transaction_services_transaction_service;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_company') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_client') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_client FOREIGN KEY (client_id) REFERENCES clients(id);
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_client;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_consultant') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_consultant FOREIGN KEY (consultant_id) REFERENCES users(id);
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_consultant;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_payment_method') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_payment_method FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id);
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_payment_method;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_session_booking') THEN
        ALTER TABLE open_bills ADD CONSTRAINT fk_open_bills_session_booking FOREIGN KEY (session_booking_id) REFERENCES session_booking(id);
    END IF;
    ALTER TABLE open_bills VALIDATE CONSTRAINT fk_open_bills_session_booking;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bill_items_open_bill') THEN
        ALTER TABLE open_bill_items ADD CONSTRAINT fk_open_bill_items_open_bill FOREIGN KEY (open_bill_id) REFERENCES open_bills(id) ON DELETE CASCADE;
    END IF;
    ALTER TABLE open_bill_items VALIDATE CONSTRAINT fk_open_bill_items_open_bill;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bill_items_transaction_service') THEN
        ALTER TABLE open_bill_items ADD CONSTRAINT fk_open_bill_items_transaction_service FOREIGN KEY (transaction_service_id) REFERENCES transaction_service(id);
    END IF;
    ALTER TABLE open_bill_items VALIDATE CONSTRAINT fk_open_bill_items_transaction_service;
END $$;

DO $$
BEGIN
    -- Guest app order/wallet/notification relations.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_orders_company') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT fk_guest_orders_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT fk_guest_orders_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_orders_client') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT fk_guest_orders_client FOREIGN KEY (client_id) REFERENCES clients(id);
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT fk_guest_orders_client;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_orders_guest_user') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT fk_guest_orders_guest_user FOREIGN KEY (guest_user_id) REFERENCES guest_users(id);
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT fk_guest_orders_guest_user;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_orders_bill') THEN
        ALTER TABLE guest_orders ADD CONSTRAINT fk_guest_orders_bill FOREIGN KEY (bill_id) REFERENCES bills(id);
    END IF;
    ALTER TABLE guest_orders VALIDATE CONSTRAINT fk_guest_orders_bill;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_order_items_order') THEN
        ALTER TABLE guest_order_items ADD CONSTRAINT fk_guest_order_items_order FOREIGN KEY (order_id) REFERENCES guest_orders(id) ON DELETE CASCADE;
    END IF;
    ALTER TABLE guest_order_items VALIDATE CONSTRAINT fk_guest_order_items_order;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_order_items_product') THEN
        ALTER TABLE guest_order_items ADD CONSTRAINT fk_guest_order_items_product FOREIGN KEY (product_id) REFERENCES guest_products(id);
    END IF;
    ALTER TABLE guest_order_items VALIDATE CONSTRAINT fk_guest_order_items_product;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_products_company') THEN
        ALTER TABLE guest_products ADD CONSTRAINT fk_guest_products_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE guest_products VALIDATE CONSTRAINT fk_guest_products_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_products_session_type') THEN
        ALTER TABLE guest_products ADD CONSTRAINT fk_guest_products_session_type FOREIGN KEY (session_type_id) REFERENCES session_type(id);
    END IF;
    ALTER TABLE guest_products VALIDATE CONSTRAINT fk_guest_products_session_type;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_products_transaction_service') THEN
        ALTER TABLE guest_products ADD CONSTRAINT fk_guest_products_transaction_service FOREIGN KEY (transaction_service_id) REFERENCES transaction_service(id);
    END IF;
    ALTER TABLE guest_products VALIDATE CONSTRAINT fk_guest_products_transaction_service;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlements_company') THEN
        ALTER TABLE guest_entitlements ADD CONSTRAINT fk_guest_entitlements_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE guest_entitlements VALIDATE CONSTRAINT fk_guest_entitlements_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlements_client') THEN
        ALTER TABLE guest_entitlements ADD CONSTRAINT fk_guest_entitlements_client FOREIGN KEY (client_id) REFERENCES clients(id);
    END IF;
    ALTER TABLE guest_entitlements VALIDATE CONSTRAINT fk_guest_entitlements_client;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlements_product') THEN
        ALTER TABLE guest_entitlements ADD CONSTRAINT fk_guest_entitlements_product FOREIGN KEY (product_id) REFERENCES guest_products(id);
    END IF;
    ALTER TABLE guest_entitlements VALIDATE CONSTRAINT fk_guest_entitlements_product;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlements_source_order') THEN
        ALTER TABLE guest_entitlements ADD CONSTRAINT fk_guest_entitlements_source_order FOREIGN KEY (source_order_id) REFERENCES guest_orders(id);
    END IF;
    ALTER TABLE guest_entitlements VALIDATE CONSTRAINT fk_guest_entitlements_source_order;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlement_usages_entitlement') THEN
        ALTER TABLE guest_entitlement_usages ADD CONSTRAINT fk_guest_entitlement_usages_entitlement FOREIGN KEY (entitlement_id) REFERENCES guest_entitlements(id);
    END IF;
    ALTER TABLE guest_entitlement_usages VALIDATE CONSTRAINT fk_guest_entitlement_usages_entitlement;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_entitlement_usages_session') THEN
        ALTER TABLE guest_entitlement_usages ADD CONSTRAINT fk_guest_entitlement_usages_session FOREIGN KEY (session_booking_id) REFERENCES session_booking(id);
    END IF;
    ALTER TABLE guest_entitlement_usages VALIDATE CONSTRAINT fk_guest_entitlement_usages_session;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_notifications_guest_user') THEN
        ALTER TABLE guest_notifications ADD CONSTRAINT fk_guest_notifications_guest_user FOREIGN KEY (guest_user_id) REFERENCES guest_users(id) ON DELETE CASCADE;
    END IF;
    ALTER TABLE guest_notifications VALIDATE CONSTRAINT fk_guest_notifications_guest_user;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_notifications_company') THEN
        ALTER TABLE guest_notifications ADD CONSTRAINT fk_guest_notifications_company FOREIGN KEY (company_id) REFERENCES company(id);
    END IF;
    ALTER TABLE guest_notifications VALIDATE CONSTRAINT fk_guest_notifications_company;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_notifications_client') THEN
        ALTER TABLE guest_notifications ADD CONSTRAINT fk_guest_notifications_client FOREIGN KEY (client_id) REFERENCES clients(id);
    END IF;
    ALTER TABLE guest_notifications VALIDATE CONSTRAINT fk_guest_notifications_client;
END $$;


-- ============================================================================
-- Course Access Progress
-- ============================================================================

CREATE TABLE IF NOT EXISTS course_access_progress (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    entitlement_id BIGINT NOT NULL,
    course_id BIGINT NOT NULL,
    position_seconds INTEGER NOT NULL DEFAULT 0,
    duration_seconds INTEGER,
    progress_percent DOUBLE PRECISION NOT NULL DEFAULT 0,
    completed BOOLEAN NOT NULL DEFAULT FALSE,
    last_played_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uk_course_access_progress_entitlement_course UNIQUE (entitlement_id, course_id),
    CONSTRAINT fk_course_access_progress_entitlement FOREIGN KEY (entitlement_id) REFERENCES guest_entitlements(id) ON DELETE CASCADE,
    CONSTRAINT fk_course_access_progress_course FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_course_access_progress_entitlement ON course_access_progress(entitlement_id);
CREATE INDEX IF NOT EXISTS idx_course_access_progress_course ON course_access_progress(course_id);

-- backend/src/main/java/com/example/app/delivery/MessageDeliveryLog.java
CREATE TABLE IF NOT EXISTS message_delivery_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP(6) WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id),
    client_id BIGINT REFERENCES clients(id),
    guest_user_id BIGINT,
    channel VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL,
    message_type VARCHAR(80) NOT NULL,
    recipient VARCHAR(320),
    subject VARCHAR(500),
    message_preview VARCHAR(1200),
    reference_type VARCHAR(80),
    reference_id VARCHAR(80),
    provider_message_id VARCHAR(255),
    provider_status_code VARCHAR(80),
    error_message VARCHAR(1200),
    retry_count INTEGER NOT NULL DEFAULT 0,
    sent_at TIMESTAMP(6) WITH TIME ZONE,
    delivered_at TIMESTAMP(6) WITH TIME ZONE,
    failed_at TIMESTAMP(6) WITH TIME ZONE,
    metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_message_delivery_company_created
    ON message_delivery_logs(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_message_delivery_company_status
    ON message_delivery_logs(company_id, status);

CREATE INDEX IF NOT EXISTS idx_message_delivery_company_channel
    ON message_delivery_logs(company_id, channel);

CREATE INDEX IF NOT EXISTS idx_message_delivery_reference
    ON message_delivery_logs(company_id, reference_type, reference_id);


-- ============================================================================
-- Scheduled job run tracking
-- ============================================================================

CREATE TABLE IF NOT EXISTS scheduled_job_runs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    job_name VARCHAR(120) NOT NULL,
    status VARCHAR(32) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    finished_at TIMESTAMP WITH TIME ZONE,
    duration_ms BIGINT,
    instance_id VARCHAR(160),
    locked_by VARCHAR(160),
    records_processed INTEGER,
    error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_job_started
    ON scheduled_job_runs (job_name, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_status_started
    ON scheduled_job_runs (status, started_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_runs_created
    ON scheduled_job_runs (created_at);

CREATE TABLE IF NOT EXISTS scheduled_job_alert_states (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    job_name VARCHAR(120) NOT NULL,
    alert_type VARCHAR(48) NOT NULL,
    status VARCHAR(32) NOT NULL,
    severity VARCHAR(32) NOT NULL,
    first_detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    last_detected_at TIMESTAMP WITH TIME ZONE NOT NULL,
    resolved_at TIMESTAMP WITH TIME ZONE,
    last_email_sent_at TIMESTAMP WITH TIME ZONE,
    last_recovery_email_sent_at TIMESTAMP WITH TIME ZONE,
    last_run_id BIGINT,
    message TEXT
);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_alert_states_status
    ON scheduled_job_alert_states (status, last_detected_at DESC);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_alert_states_job_status
    ON scheduled_job_alert_states (job_name, status);

CREATE INDEX IF NOT EXISTS idx_scheduled_job_alert_states_job_type_status
    ON scheduled_job_alert_states (job_name, alert_type, status);

-- ============================================================================
-- Invoice email recipient opt-out
-- ============================================================================
-- Add per-recipient invoice email opt-out flag to clients and client companies.
-- When true, invoice emails are never sent to that client/company, overriding the
-- tenant-wide INVOICE_DELIVERY_EMAIL_ENABLED setting.

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS suppress_invoice_emails BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE client_companies
    ADD COLUMN IF NOT EXISTS suppress_invoice_emails BOOLEAN NOT NULL DEFAULT FALSE;

-- Custom fields / UDF definitions and values
CREATE TABLE IF NOT EXISTS custom_field_definitions (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    applies_to VARCHAR(24) NOT NULL,
    name VARCHAR(255) NOT NULL,
    field_type VARCHAR(24) NOT NULL,
    required BOOLEAN NOT NULL DEFAULT FALSE,
    show_in_list BOOLEAN NOT NULL DEFAULT FALSE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    options_json VARCHAR(4000),
    CONSTRAINT fk_custom_field_definitions_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS custom_field_values (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    field_definition_id BIGINT NOT NULL,
    entity_type VARCHAR(24) NOT NULL,
    entity_id BIGINT NOT NULL,
    value_text VARCHAR(4000),
    CONSTRAINT uk_custom_field_values_definition_entity UNIQUE (field_definition_id, entity_id),
    CONSTRAINT fk_custom_field_values_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_custom_field_values_definition FOREIGN KEY (field_definition_id) REFERENCES custom_field_definitions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_custom_field_definitions_company_applies
    ON custom_field_definitions(company_id, applies_to, active, sort_order, name, id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_company_entity
    ON custom_field_values(company_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_definition
    ON custom_field_values(field_definition_id);

CREATE INDEX IF NOT EXISTS idx_client_assigned_users_user_client ON client_assigned_users (user_id, client_id);
CREATE INDEX IF NOT EXISTS idx_client_assigned_users_client_user ON client_assigned_users (client_id, user_id);


-- ============================================================================
-- Referrals
-- ============================================================================

-- Refer a friend: personal referral codes and per-tenant referral tracking.

-- backend/src/main/java/com/example/app/referral/ReferralCode.java
CREATE TABLE IF NOT EXISTS referral_codes (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    code VARCHAR(64) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT uk_referral_codes_code UNIQUE (code)
);

CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes (user_id);

-- backend/src/main/java/com/example/app/referral/Referral.java
CREATE TABLE IF NOT EXISTS referrals (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    referrer_company_id BIGINT NOT NULL,
    referrer_user_id BIGINT NOT NULL,
    code VARCHAR(64) NOT NULL,
    referred_company_id BIGINT,
    referred_email VARCHAR(255),
    status VARCHAR(32) NOT NULL,
    registered_at TIMESTAMP WITH TIME ZONE,
    qualified_at TIMESTAMP WITH TIME ZONE,
    referrer_reward_granted BOOLEAN NOT NULL DEFAULT FALSE,
    referred_reward_granted BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_referrals_referred_company ON referrals (referred_company_id);
CREATE INDEX IF NOT EXISTS idx_referrals_referrer_company ON referrals (referrer_company_id);


-- ============================================================================
-- Notification Center And Platform Announcements
-- ============================================================================

-- Tenant staff notification center and platform announcements.
CREATE TABLE IF NOT EXISTS platform_announcements (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    title VARCHAR(180) NOT NULL,
    message VARCHAR(2000) NOT NULL,
    category VARCHAR(40) NOT NULL DEFAULT 'SYSTEM',
    severity VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    starts_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    show_banner BOOLEAN NOT NULL DEFAULT FALSE,
    action_url VARCHAR(600),
    target_company_ids_json TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS tenant_notifications (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category VARCHAR(40) NOT NULL,
    type VARCHAR(60) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'NORMAL',
    title VARCHAR(180) NOT NULL,
    message VARCHAR(1200) NOT NULL,
    source VARCHAR(50),
    entity_type VARCHAR(50),
    entity_id BIGINT,
    action_url VARCHAR(600),
    dedupe_key VARCHAR(180) NOT NULL,
    metadata_json TEXT,
    read_at TIMESTAMP WITH TIME ZONE,
    expires_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT uq_tenant_notification_dedupe UNIQUE (recipient_user_id, dedupe_key)
);

CREATE INDEX IF NOT EXISTS idx_tenant_notifications_recipient_created
    ON tenant_notifications (recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_notifications_company_created
    ON tenant_notifications (company_id, created_at DESC);

CREATE TABLE IF NOT EXISTS platform_announcement_reads (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    announcement_id BIGINT NOT NULL REFERENCES platform_announcements(id) ON DELETE CASCADE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    read_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT uq_platform_announcement_read UNIQUE (announcement_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_platform_announcement_reads_user
    ON platform_announcement_reads (user_id, announcement_id);


-- ============================================================================
-- Waitlist Core
-- ============================================================================

CREATE TABLE IF NOT EXISTS waitlist_requests (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    client_id BIGINT REFERENCES clients(id) ON DELETE SET NULL,
    guest_user_id BIGINT,
    service_id BIGINT NOT NULL REFERENCES session_type(id) ON DELETE RESTRICT,
    location_id BIGINT,
    target_type VARCHAR(32) NOT NULL,
    target_session_id BIGINT REFERENCES session_booking(id) ON DELETE SET NULL,
    date_from DATE NOT NULL,
    date_to DATE NOT NULL,
    employee_preference_type VARCHAR(24) NOT NULL DEFAULT 'ANY',
    specific_employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    requested_participants INTEGER NOT NULL DEFAULT 1,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    source VARCHAR(24) NOT NULL DEFAULT 'STAFF',
    notes VARCHAR(2000),
    joined_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE,
    booked_booking_id BIGINT REFERENCES session_booking(id) ON DELETE SET NULL,
    duplicate_key VARCHAR(128) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_waitlist_request_dates CHECK (date_to >= date_from),
    CONSTRAINT chk_waitlist_request_participants CHECK (requested_participants > 0)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_company_status ON waitlist_requests(company_id, status, joined_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_company_dates ON waitlist_requests(company_id, date_from, date_to);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_duplicate ON waitlist_requests(company_id, duplicate_key, status);

CREATE TABLE IF NOT EXISTS waitlist_request_windows (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    day_of_week VARCHAR(16),
    date DATE,
    time_from TIME,
    time_to TIME,
    all_day BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT chk_waitlist_window_time CHECK (all_day OR time_from IS NULL OR time_to IS NULL OR time_to > time_from)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_window_request ON waitlist_request_windows(waitlist_request_id);

CREATE TABLE IF NOT EXISTS waitlist_request_employees (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    CONSTRAINT uq_waitlist_request_employee UNIQUE(waitlist_request_id, employee_id)
);

CREATE TABLE IF NOT EXISTS waitlist_offers (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    room_id BIGINT REFERENCES space(id) ON DELETE SET NULL,
    session_id BIGINT REFERENCES session_booking(id) ON DELETE SET NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    offered_at TIMESTAMP WITH TIME ZONE NOT NULL,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    accepted_at TIMESTAMP WITH TIME ZONE,
    declined_at TIMESTAMP WITH TIME ZONE,
    secure_token_hash VARCHAR(128) NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_waitlist_offer_slot CHECK (slot_end > slot_start)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_offer_company_status_expiry ON waitlist_offers(company_id, status, expires_at);
CREATE INDEX IF NOT EXISTS idx_waitlist_offer_request ON waitlist_offers(waitlist_request_id, offered_at);

CREATE TABLE IF NOT EXISTS waitlist_booking_holds (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    offer_id BIGINT NOT NULL UNIQUE REFERENCES waitlist_offers(id) ON DELETE CASCADE,
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    room_id BIGINT REFERENCES space(id) ON DELETE SET NULL,
    session_id BIGINT REFERENCES session_booking(id) ON DELETE SET NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    version BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT chk_waitlist_hold_slot CHECK (slot_end > slot_start)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_hold_active_slot ON waitlist_booking_holds(company_id, status, slot_start, slot_end);

CREATE TABLE IF NOT EXISTS waitlist_events (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    offer_id BIGINT REFERENCES waitlist_offers(id) ON DELETE SET NULL,
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    event_type VARCHAR(40) NOT NULL,
    detail VARCHAR(2000),
    occurred_at TIMESTAMP WITH TIME ZONE NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_waitlist_event_request_time ON waitlist_events(waitlist_request_id, occurred_at);

CREATE TABLE IF NOT EXISTS waitlist_slot_skips (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    employee_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    skipped_by_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_waitlist_skip_slot
    ON waitlist_slot_skips(waitlist_request_id, slot_start, COALESCE(employee_id, -1));



-- ============================================================================
-- Waitlist Offer Expiring Notification
-- ============================================================================

ALTER TABLE waitlist_offers
    ADD COLUMN IF NOT EXISTS expiring_notified_at TIMESTAMP WITH TIME ZONE;

CREATE INDEX IF NOT EXISTS idx_waitlist_offer_expiring_notification
    ON waitlist_offers(status, expires_at, expiring_notified_at);


-- ============================================================================
-- Service Groups
-- ============================================================================

CREATE TABLE IF NOT EXISTS service_group (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(120) NOT NULL,
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_service_group_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT uq_service_group_company_name UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_service_group_company_sort
    ON service_group(company_id, sort_order, id);

ALTER TABLE session_type
    ADD COLUMN IF NOT EXISTS service_group_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_type_service_group'
    ) THEN
        ALTER TABLE session_type
            ADD CONSTRAINT fk_session_type_service_group
            FOREIGN KEY (service_group_id) REFERENCES service_group(id)
            ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_session_type_service_group_sort
    ON session_type(company_id, service_group_id, guest_sort_order, id);


-- ============================================================================
-- Group Waitlist And Analytics
-- ============================================================================

-- Phase B/C: service-group waitlist scopes and historical service-group analytics snapshots.

ALTER TABLE waitlist_requests
    ADD COLUMN IF NOT EXISTS service_scope VARCHAR(24) NOT NULL DEFAULT 'EXACT_SERVICE',
    ADD COLUMN IF NOT EXISTS service_group_id BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_id_snapshot BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_name_snapshot VARCHAR(120);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waitlist_request_service_group') THEN
        ALTER TABLE waitlist_requests
            ADD CONSTRAINT fk_waitlist_request_service_group
            FOREIGN KEY (service_group_id) REFERENCES service_group(id) ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE waitlist_requests ALTER COLUMN service_id DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_waitlist_request_service_scope
    ON waitlist_requests(company_id, service_scope, service_group_id, service_id);

CREATE TABLE IF NOT EXISTS waitlist_request_services (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    waitlist_request_id BIGINT NOT NULL REFERENCES waitlist_requests(id) ON DELETE CASCADE,
    service_id BIGINT REFERENCES session_type(id) ON DELETE SET NULL,
    service_name_snapshot VARCHAR(255) NOT NULL,
    service_group_id_snapshot BIGINT,
    service_group_name_snapshot VARCHAR(120),
    duration_minutes_snapshot INTEGER,
    sort_order_snapshot INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT uq_waitlist_request_service UNIQUE(waitlist_request_id, service_id)
);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_services_request
    ON waitlist_request_services(waitlist_request_id, sort_order_snapshot, id);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_services_service
    ON waitlist_request_services(service_id, waitlist_request_id);

ALTER TABLE waitlist_offers
    ADD COLUMN IF NOT EXISTS service_id BIGINT,
    ADD COLUMN IF NOT EXISTS service_name_snapshot VARCHAR(255),
    ADD COLUMN IF NOT EXISTS service_group_id_snapshot BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_name_snapshot VARCHAR(120),
    ADD COLUMN IF NOT EXISTS available_slot_end TIMESTAMP;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waitlist_offer_service') THEN
        ALTER TABLE waitlist_offers
            ADD CONSTRAINT fk_waitlist_offer_service
            FOREIGN KEY (service_id) REFERENCES session_type(id) ON DELETE RESTRICT;
    END IF;
END $$;

ALTER TABLE waitlist_offers ALTER COLUMN service_id SET NOT NULL;
ALTER TABLE waitlist_offers ALTER COLUMN service_name_snapshot SET NOT NULL;
ALTER TABLE waitlist_offers ALTER COLUMN available_slot_end SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waitlist_offer_service_group_snapshot
    ON waitlist_offers(company_id, service_group_id_snapshot, offered_at);

ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS service_group_id_snapshot BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_name_snapshot VARCHAR(120),
    ADD COLUMN IF NOT EXISTS service_group_snapshot_captured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_session_booking_group_snapshot
    ON session_booking(company_id, service_group_id_snapshot, start_time, id);

ALTER TABLE bill_item
    ADD COLUMN IF NOT EXISTS service_group_id_snapshot BIGINT,
    ADD COLUMN IF NOT EXISTS service_group_name_snapshot VARCHAR(120),
    ADD COLUMN IF NOT EXISTS service_group_snapshot_captured BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_bill_item_group_snapshot
    ON bill_item(service_group_id_snapshot, source_session_booking_id, id);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_waitlist_request_service_scope') THEN
        ALTER TABLE waitlist_requests
            ADD CONSTRAINT chk_waitlist_request_service_scope CHECK (
                (service_scope = 'EXACT_SERVICE' AND service_id IS NOT NULL)
                OR (service_scope = 'SERVICE_GROUP' AND service_group_id_snapshot IS NOT NULL)
            );
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_waitlist_offer_available_slot') THEN
        ALTER TABLE waitlist_offers
            ADD CONSTRAINT chk_waitlist_offer_available_slot CHECK (
                available_slot_end >= slot_end
            );
    END IF;
END $$;


-- ============================================================================
-- Production Hardening
-- ============================================================================

-- Production hardening:
-- 1) move billing precision changes out of application startup and into Flyway;
-- 2) align persisted numeric precision with the JPA mappings;
-- 4) add bounded-worker indexes used by scheduled jobs.

ALTER TABLE open_bill_items ADD COLUMN IF NOT EXISTS unit_gross_price NUMERIC(12,2);

ALTER TABLE open_bill_items
    ALTER COLUMN net_price TYPE NUMERIC(12,4) USING net_price::NUMERIC(12,4),
    ALTER COLUMN unit_gross_price TYPE NUMERIC(12,2) USING ROUND(unit_gross_price::NUMERIC, 2);

ALTER TABLE bill_item
    ALTER COLUMN net_price TYPE NUMERIC(12,4) USING net_price::NUMERIC(12,4),
    ALTER COLUMN gross_price TYPE NUMERIC(12,2) USING ROUND(gross_price::NUMERIC, 2);

ALTER TABLE transaction_service
    ALTER COLUMN net_price TYPE NUMERIC(12,4) USING net_price::NUMERIC(12,4);

ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS proforma_number VARCHAR(80);
ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS proforma_sequence_number BIGINT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_open_bills_company_proforma_number
    ON open_bills(company_id, proforma_number)
    WHERE proforma_number IS NOT NULL;

-- The pre-production singular waitlist schema is not part of the production baseline.


CREATE INDEX IF NOT EXISTS idx_scheduled_messages_due
    ON scheduled_messages(status, next_run_at, id);

CREATE INDEX IF NOT EXISTS idx_waitlist_offers_pending_expiry
    ON waitlist_offers(expires_at, id)
    WHERE status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_waitlist_holds_active_expiry
    ON waitlist_booking_holds(expires_at, id)
    WHERE status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_client_messages_latest_open
    ON client_messages(company_id, client_id, created_at DESC, id DESC)
    INCLUDE (conversation_key, channel)
    WHERE conversation_closed = FALSE;

-- Online meeting provisioning is durable and happens after the booking transaction,
-- so Zoom/Google latency never holds the per-tenant booking lock.
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_status VARCHAR(20) NOT NULL DEFAULT 'NONE';
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_error VARCHAR(1000);
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_started_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_provisioning_next_attempt_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS meeting_confirmation_pending BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_session_booking_meeting_provisioning_due
    ON session_booking(meeting_provisioning_status, meeting_provisioning_next_attempt_at, id)
    WHERE meeting_link IS NULL
      AND meeting_provisioning_status IN ('PENDING', 'RETRY', 'PROCESSING');


-- ============================================================================
-- Align Remaining Billing Precision
-- ============================================================================

-- Align the remaining billing columns with their JPA precision/scale mappings.

ALTER TABLE advance_allocations
    ALTER COLUMN amount_net TYPE NUMERIC(12,2)
    USING ROUND(amount_net::NUMERIC, 2);

ALTER TABLE bills
    ALTER COLUMN total_net TYPE NUMERIC(12,2)
    USING ROUND(total_net::NUMERIC, 2),
    ALTER COLUMN total_gross TYPE NUMERIC(12,2)
    USING ROUND(total_gross::NUMERIC, 2);

ALTER TABLE bill_payments
    ALTER COLUMN amount_gross TYPE NUMERIC(12,2)
    USING ROUND(amount_gross::NUMERIC, 2);

ALTER TABLE open_bill_payments
    ALTER COLUMN amount_gross TYPE NUMERIC(12,2)
    USING ROUND(amount_gross::NUMERIC, 2);


-- ============================================================================
-- Platform Demo Booking
-- ============================================================================

CREATE TABLE IF NOT EXISTS platform_demo_booking_profiles (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    slug VARCHAR(80) NOT NULL UNIQUE,
    title VARCHAR(200) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    duration_minutes INTEGER NOT NULL DEFAULT 30,
    slot_step_minutes INTEGER NOT NULL DEFAULT 30,
    buffer_before_minutes INTEGER NOT NULL DEFAULT 10,
    buffer_after_minutes INTEGER NOT NULL DEFAULT 10,
    minimum_notice_minutes INTEGER NOT NULL DEFAULT 1440,
    booking_horizon_days INTEGER NOT NULL DEFAULT 30,
    maximum_bookings_per_day INTEGER NOT NULL DEFAULT 4,
    time_zone VARCHAR(80) NOT NULL DEFAULT 'Europe/Ljubljana',
    meeting_provider VARCHAR(24) NOT NULL DEFAULT 'GOOGLE_MEET',
    host_user_id BIGINT REFERENCES users(id),
    availability_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS platform_demo_bookings (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    profile_id BIGINT NOT NULL REFERENCES platform_demo_booking_profiles(id),
    host_user_id BIGINT NOT NULL REFERENCES users(id),
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'CONFIRMED',
    guest_name VARCHAR(200) NOT NULL,
    guest_email VARCHAR(320) NOT NULL,
    guest_phone VARCHAR(80),
    company_name VARCHAR(240) NOT NULL,
    guest_note VARCHAR(2000),
    guest_time_zone VARCHAR(80) NOT NULL,
    locale VARCHAR(8) NOT NULL DEFAULT 'sl',
    meeting_provider VARCHAR(24) NOT NULL,
    meeting_join_url VARCHAR(1000),
    external_meeting_id VARCHAR(255),
    calendar_block_id BIGINT,
    manage_token VARCHAR(100) NOT NULL UNIQUE,
    utm_source VARCHAR(200),
    utm_medium VARCHAR(200),
    utm_campaign VARCHAR(200),
    cancelled_at TIMESTAMPTZ,
    reminder_24h_sent_at TIMESTAMPTZ,
    reminder_1h_sent_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS platform_demo_booking_holds (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    profile_id BIGINT NOT NULL REFERENCES platform_demo_booking_profiles(id) ON DELETE CASCADE,
    start_at TIMESTAMPTZ NOT NULL,
    end_at TIMESTAMPTZ NOT NULL,
    hold_token VARCHAR(100) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_platform_demo_bookings_profile_time
    ON platform_demo_bookings(profile_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_platform_demo_bookings_status_time
    ON platform_demo_bookings(status, start_at);
CREATE INDEX IF NOT EXISTS idx_platform_demo_booking_holds_profile_time
    ON platform_demo_booking_holds(profile_id, expires_at, start_at, end_at);


-- ============================================================================
-- Demo Booking As Booked Session
-- ============================================================================

ALTER TABLE platform_demo_bookings
    ADD COLUMN IF NOT EXISTS session_booking_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_platform_demo_booking_session_booking'
    ) THEN
        ALTER TABLE platform_demo_bookings
            ADD CONSTRAINT fk_platform_demo_booking_session_booking
            FOREIGN KEY (session_booking_id) REFERENCES session_booking(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_platform_demo_bookings_session_booking
    ON platform_demo_bookings(session_booking_id);


-- ============================================================================
-- Session Booking Source
-- ============================================================================

ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS booking_source VARCHAR(32);

ALTER TABLE session_booking
    ALTER COLUMN booking_source SET DEFAULT 'MANUAL';

ALTER TABLE session_booking
    ALTER COLUMN booking_source SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_session_booking_booking_source'
    ) THEN
        ALTER TABLE session_booking
            ADD CONSTRAINT chk_session_booking_booking_source
            CHECK (booking_source IN ('MANUAL', 'MOBILE_APP', 'WEBSITE_WIDGET', 'PUBLIC_BOOKING_PAGE'));
    END IF;
END $$;


-- ============================================================================
-- Session Services
-- ============================================================================

ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS availability_end_time TIMESTAMP;

CREATE TABLE IF NOT EXISTS session_service (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    session_booking_id BIGINT NOT NULL,
    session_type_id BIGINT NOT NULL,
    space_id BIGINT,
    position INTEGER NOT NULL,
    start_time TIMESTAMP NOT NULL,
    end_time TIMESTAMP NOT NULL,
    service_name_snapshot VARCHAR(255) NOT NULL,
    color_snapshot VARCHAR(20),
    duration_minutes_snapshot INTEGER NOT NULL,
    break_minutes_snapshot INTEGER NOT NULL,
    price_calculation_mode_snapshot VARCHAR(24) NOT NULL,
    service_group_id_snapshot BIGINT,
    service_group_name_snapshot VARCHAR(120),
    CONSTRAINT fk_session_service_booking
        FOREIGN KEY (session_booking_id) REFERENCES session_booking(id) ON DELETE CASCADE,
    CONSTRAINT fk_session_service_type
        FOREIGN KEY (session_type_id) REFERENCES session_type(id),
    CONSTRAINT fk_session_service_space
        FOREIGN KEY (space_id) REFERENCES space(id),
    CONSTRAINT chk_session_service_position CHECK (position >= 0),
    CONSTRAINT chk_session_service_time_order CHECK (end_time > start_time)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_session_service_booking_position
    ON session_service (session_booking_id, position);
CREATE INDEX IF NOT EXISTS idx_session_service_booking
    ON session_service (session_booking_id, position, id);
CREATE INDEX IF NOT EXISTS idx_session_service_type
    ON session_service (session_type_id);
CREATE INDEX IF NOT EXISTS idx_session_service_space_time
    ON session_service (space_id, start_time, end_time)
    WHERE space_id IS NOT NULL;

ALTER TABLE session_booking
    ALTER COLUMN availability_end_time SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_session_booking_company_availability
    ON session_booking (company_id, start_time, availability_end_time, id);


-- ============================================================================
-- Multi Service Public Booking
-- ============================================================================

ALTER TABLE guest_entitlement_usages
    ADD COLUMN IF NOT EXISTS session_service_id BIGINT;

ALTER TABLE guest_entitlement_usages
    ADD CONSTRAINT fk_guest_entitlement_usage_session_service
        FOREIGN KEY (session_service_id) REFERENCES session_service(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS ux_guest_entitlement_usage_session_service
    ON guest_entitlement_usages (session_service_id)
    WHERE session_service_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_entitlement_usage_booking_service
    ON guest_entitlement_usages (session_booking_id, session_service_id);

ALTER TABLE waitlist_requests
    ADD COLUMN IF NOT EXISTS service_chain BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================================
-- Widget Availability Indexes
-- ============================================================================

-- Fast overlap lookups used by the website booking widget.
CREATE INDEX IF NOT EXISTS idx_personal_calendar_block_company_time
    ON personal_calendar_block (company_id, start_time, end_time, owner_id);

CREATE INDEX IF NOT EXISTS idx_personal_calendar_block_availability_marker
    ON personal_calendar_block (company_id, owner_id)
    WHERE lower(task) = '__availability_block__';

-- availability_end_time is the authoritative busy endpoint, including the final service break.
CREATE INDEX IF NOT EXISTS idx_session_booking_company_busy_window_active
    ON session_booking (company_id, start_time, availability_end_time, consultant_id)
    WHERE upper(coalesce(booking_status, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW');


-- ============================================================================
-- Widget Month Availability Indexes
-- ============================================================================

-- Additional indexes for fast employee-specific month availability in the website widget.

CREATE INDEX IF NOT EXISTS idx_session_booking_widget_consultant_busy
    ON session_booking (company_id, consultant_id, start_time, availability_end_time)
    WHERE upper(coalesce(booking_status, 'RESERVED')) NOT IN ('CANCELLED', 'NO_SHOW');

CREATE INDEX IF NOT EXISTS idx_bookable_slot_widget_month
    ON bookable_slot (company_id, consultant_id, day_of_week, start_date, end_date, indefinite);

CREATE INDEX IF NOT EXISTS idx_waitlist_hold_widget_month
    ON waitlist_booking_holds (company_id, status, expires_at, slot_start, slot_end, employee_id, room_id);


-- ============================================================================
-- Service Break Defaults
-- ============================================================================

ALTER TABLE session_type
    ADD COLUMN IF NOT EXISTS break_minutes_overridden BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================================
-- Booking Slot Holds And Todo Completion
-- ============================================================================

CREATE TABLE IF NOT EXISTS booking_slot_holds (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    consultant_id BIGINT REFERENCES users(id) ON DELETE CASCADE,
    group_session_id BIGINT REFERENCES session_booking(id) ON DELETE CASCADE,
    slot_start TIMESTAMP NOT NULL,
    slot_end TIMESTAMP NOT NULL,
    busy_end TIMESTAMP NOT NULL,
    slot_id VARCHAR(500) NOT NULL,
    hold_token VARCHAR(100) NOT NULL UNIQUE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL,
    CONSTRAINT chk_booking_slot_hold_window CHECK (slot_end > slot_start AND busy_end >= slot_end)
);

CREATE INDEX IF NOT EXISTS idx_booking_slot_holds_company_employee_window
    ON booking_slot_holds (company_id, consultant_id, expires_at, slot_start, busy_end);
CREATE INDEX IF NOT EXISTS idx_booking_slot_holds_company_group
    ON booking_slot_holds (company_id, group_session_id, expires_at);

ALTER TABLE calendar_todos
    ADD COLUMN IF NOT EXISTS completed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE calendar_todos
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMP WITH TIME ZONE;
CREATE INDEX IF NOT EXISTS idx_calendar_todos_company_completed_time
    ON calendar_todos (company_id, completed, start_time);



-- ============================================================================
-- Client Online Booking Block
-- ============================================================================

ALTER TABLE clients
    ADD COLUMN IF NOT EXISTS online_booking_blocked BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================================
-- Session Type Internal Description
-- ============================================================================

ALTER TABLE session_type
    ADD COLUMN IF NOT EXISTS internal_description VARCHAR(512);


-- ============================================================================
-- Workspace Login Accounts And Unit Context
-- ============================================================================

-- Phase 1 multi-unit authentication foundation.
-- Companies are operating units inside a workspace; users are unit memberships backed by login accounts.

CREATE TABLE IF NOT EXISTS workspaces (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    name VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE company ADD COLUMN IF NOT EXISTS workspace_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_company_workspace') THEN
        ALTER TABLE company
            ADD CONSTRAINT fk_company_workspace
            FOREIGN KEY (workspace_id) REFERENCES workspaces(id);
    END IF;
END $$;

ALTER TABLE company ALTER COLUMN workspace_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_company_workspace_id ON company(workspace_id, id);


CREATE TABLE IF NOT EXISTS login_accounts (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    last_selected_company_id BIGINT
);

ALTER TABLE users ADD COLUMN IF NOT EXISTS login_account_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_users_login_account') THEN
        ALTER TABLE users
            ADD CONSTRAINT fk_users_login_account
            FOREIGN KEY (login_account_id) REFERENCES login_accounts(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_login_accounts_last_selected_company') THEN
        ALTER TABLE login_accounts
            ADD CONSTRAINT fk_login_accounts_last_selected_company
            FOREIGN KEY (last_selected_company_id) REFERENCES company(id) ON DELETE SET NULL;
    END IF;
END $$;

ALTER TABLE users ALTER COLUMN login_account_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_users_login_account ON users(login_account_id, active, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_users_login_account_company
    ON users(login_account_id, company_id);
CREATE INDEX IF NOT EXISTS idx_login_accounts_email_lower ON login_accounts(lower(email));


ALTER TABLE user_security_sessions ADD COLUMN IF NOT EXISTS login_account_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_user_security_sessions_login_account') THEN
        ALTER TABLE user_security_sessions
            ADD CONSTRAINT fk_user_security_sessions_login_account
            FOREIGN KEY (login_account_id) REFERENCES login_accounts(id) ON DELETE CASCADE;
    END IF;
END $$;

ALTER TABLE user_security_sessions ALTER COLUMN login_account_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_security_sessions_login_account_last_seen
    ON user_security_sessions(login_account_id, last_seen_at DESC);


-- ============================================================================
-- Workspace Clients And Duplicate Review
-- ============================================================================

-- Phase 2: shared client identities with non-destructive unit relationships.
-- Clients remain unit-owned and link to a workspace-level identity for cross-location visibility.

CREATE TABLE IF NOT EXISTS workspace_clients (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    public_id VARCHAR(36) NOT NULL,
    first_name VARCHAR(255) NOT NULL,
    last_name VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    phone VARCHAR(255),
    normalized_email VARCHAR(255),
    normalized_phone VARCHAR(64),
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE',
    merged_into_id BIGINT,
    CONSTRAINT uq_workspace_client_public_id UNIQUE (public_id),
    CONSTRAINT ck_workspace_client_status CHECK (status IN ('ACTIVE', 'MERGED', 'ANONYMIZED')),
    CONSTRAINT fk_workspace_client_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT fk_workspace_client_merged_into FOREIGN KEY (merged_into_id) REFERENCES workspace_clients(id)
);

CREATE INDEX IF NOT EXISTS idx_workspace_clients_workspace_name
    ON workspace_clients(workspace_id, lower(last_name), lower(first_name), id);
CREATE INDEX IF NOT EXISTS idx_workspace_clients_workspace_email
    ON workspace_clients(workspace_id, normalized_email) WHERE normalized_email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_workspace_clients_workspace_phone
    ON workspace_clients(workspace_id, normalized_phone) WHERE normalized_phone IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_workspace_clients_id_workspace
    ON workspace_clients(id, workspace_id);

ALTER TABLE clients ADD COLUMN IF NOT EXISTS workspace_client_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_clients_workspace_client') THEN
        ALTER TABLE clients
            ADD CONSTRAINT fk_clients_workspace_client
            FOREIGN KEY (workspace_client_id) REFERENCES workspace_clients(id);
    END IF;
END $$;

ALTER TABLE clients ALTER COLUMN workspace_client_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_workspace_client ON clients(workspace_client_id, company_id, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_workspace_client_company
    ON clients(workspace_client_id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_id_company
    ON clients(id, company_id);


CREATE TABLE IF NOT EXISTS workspace_client_duplicate_candidates (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    left_workspace_client_id BIGINT NOT NULL,
    right_workspace_client_id BIGINT NOT NULL,
    score INTEGER NOT NULL,
    reasons_json TEXT NOT NULL DEFAULT '[]',
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    reviewed_at TIMESTAMP WITH TIME ZONE,
    reviewed_by_user_id BIGINT,
    CONSTRAINT uq_workspace_client_duplicate_pair UNIQUE (
        workspace_id, left_workspace_client_id, right_workspace_client_id
    ),
    CONSTRAINT ck_workspace_client_duplicate_order CHECK (left_workspace_client_id < right_workspace_client_id),
    CONSTRAINT ck_workspace_client_duplicate_score CHECK (score BETWEEN 0 AND 100),
    CONSTRAINT ck_workspace_client_duplicate_status CHECK (
        status IN ('PENDING', 'CONFIRMED_SAME_PERSON', 'NOT_DUPLICATE', 'DEFERRED', 'MERGED')
    ),
    CONSTRAINT fk_workspace_client_duplicate_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT fk_workspace_client_duplicate_left FOREIGN KEY (left_workspace_client_id) REFERENCES workspace_clients(id),
    CONSTRAINT fk_workspace_client_duplicate_right FOREIGN KEY (right_workspace_client_id) REFERENCES workspace_clients(id),
    CONSTRAINT fk_workspace_client_duplicate_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_client_duplicates_review
    ON workspace_client_duplicate_candidates(workspace_id, status, score DESC, created_at, id);

CREATE TABLE IF NOT EXISTS workspace_client_audit_log (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    actor_user_id BIGINT,
    actor_company_id BIGINT,
    action VARCHAR(48) NOT NULL,
    workspace_client_id BIGINT,
    related_workspace_client_id BIGINT,
    client_id BIGINT,
    details_json TEXT NOT NULL DEFAULT '{}',
    CONSTRAINT fk_workspace_client_audit_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT fk_workspace_client_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_workspace_client_audit_actor_company FOREIGN KEY (actor_company_id) REFERENCES company(id) ON DELETE SET NULL,
    CONSTRAINT fk_workspace_client_audit_identity FOREIGN KEY (workspace_client_id) REFERENCES workspace_clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_workspace_client_audit_related_identity FOREIGN KEY (related_workspace_client_id) REFERENCES workspace_clients(id) ON DELETE SET NULL,
    CONSTRAINT fk_workspace_client_audit_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_workspace_client_audit_identity
    ON workspace_client_audit_log(workspace_id, workspace_client_id, created_at DESC, id DESC);

-- New client rows created outside JPA still receive a workspace identity, and links cannot cross workspaces.
CREATE OR REPLACE FUNCTION calendra_ensure_workspace_client_link()
RETURNS trigger AS $$
DECLARE
    expected_workspace_id BIGINT;
    linked_workspace_id BIGINT;
    identity_seed TEXT;
BEGIN
    SELECT workspace_id INTO expected_workspace_id FROM company WHERE id = NEW.company_id;
    IF expected_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Cannot resolve workspace for company %', NEW.company_id;
    END IF;

    IF NEW.workspace_client_id IS NULL THEN
        identity_seed := 'workspace-client-new:' || expected_workspace_id::text || ':' ||
                coalesce(NEW.id::text, clock_timestamp()::text || random()::text);
        INSERT INTO workspace_clients (
            created_at, updated_at, workspace_id, public_id, first_name, last_name,
            email, phone, normalized_email, normalized_phone, status
        ) VALUES (
            COALESCE(NEW.created_at, now()),
            COALESCE(NEW.updated_at, now()),
            expected_workspace_id,
            substr(md5(identity_seed), 1, 8) || '-' ||
            substr(md5(identity_seed), 9, 4) || '-' ||
            substr(md5(identity_seed), 13, 4) || '-' ||
            substr(md5(identity_seed), 17, 4) || '-' ||
            substr(md5(identity_seed), 21, 12),
            NEW.first_name,
            NEW.last_name,
            nullif(lower(trim(NEW.email)), ''),
            nullif(trim(NEW.phone), ''),
            nullif(lower(trim(NEW.email)), ''),
            nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g'), ''),
            CASE WHEN NEW.anonymized THEN 'ANONYMIZED' ELSE 'ACTIVE' END
        ) RETURNING id INTO NEW.workspace_client_id;

        INSERT INTO workspace_client_audit_log (
            created_at, updated_at, workspace_id, actor_company_id, action,
            workspace_client_id, client_id, details_json
        ) VALUES (
            now(), now(), expected_workspace_id, NEW.company_id, 'WORKSPACE_CLIENT_DATABASE_CREATED',
            NEW.workspace_client_id, null, json_build_object('rawClientId', NEW.id)::text
        );
    ELSE
        SELECT workspace_id INTO linked_workspace_id
          FROM workspace_clients
         WHERE id = NEW.workspace_client_id;
        IF linked_workspace_id IS NULL THEN
            RAISE EXCEPTION 'Workspace client % does not exist', NEW.workspace_client_id;
        END IF;
        IF linked_workspace_id <> expected_workspace_id THEN
            RAISE EXCEPTION 'Workspace client % belongs to workspace %, not %',
                NEW.workspace_client_id, linked_workspace_id, expected_workspace_id;
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.workspace_client_id IS DISTINCT FROM NEW.workspace_client_id THEN
            INSERT INTO workspace_client_audit_log (
                created_at, updated_at, workspace_id, actor_company_id, action,
                workspace_client_id, related_workspace_client_id, client_id, details_json
            ) VALUES (
                now(), now(), expected_workspace_id, NEW.company_id, 'WORKSPACE_CLIENT_DATABASE_LINK_CHANGED',
                NEW.workspace_client_id, OLD.workspace_client_id, NEW.id,
                json_build_object('oldWorkspaceClientId', OLD.workspace_client_id,
                                  'newWorkspaceClientId', NEW.workspace_client_id)::text
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_ensure_workspace_client_link ON clients;
CREATE TRIGGER trg_clients_ensure_workspace_client_link
BEFORE INSERT OR UPDATE OF workspace_client_id, company_id ON clients
FOR EACH ROW EXECUTE FUNCTION calendra_ensure_workspace_client_link();

-- Shared contact identity is canonical. Anonymization is intentionally excluded so a unit can anonymize
-- its relationship without erasing the same person's identity in another unit.
CREATE OR REPLACE FUNCTION calendra_sync_workspace_client_identity()
RETURNS trigger AS $$
BEGIN
    IF pg_trigger_depth() > 1 OR NEW.anonymized THEN
        RETURN NEW;
    END IF;

    UPDATE workspace_clients
       SET first_name = NEW.first_name,
           last_name = NEW.last_name,
           email = nullif(lower(trim(NEW.email)), ''),
           phone = nullif(trim(NEW.phone), ''),
           normalized_email = nullif(lower(trim(NEW.email)), ''),
           normalized_phone = nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g'), ''),
           updated_at = now()
     WHERE id = NEW.workspace_client_id
       AND status = 'ACTIVE';

    UPDATE clients
       SET first_name = NEW.first_name,
           last_name = NEW.last_name,
           email = nullif(lower(trim(NEW.email)), ''),
           phone = nullif(trim(NEW.phone), ''),
           whatsapp_phone = CASE
               WHEN whatsapp_phone IS NULL OR whatsapp_phone = '' OR whatsapp_phone = OLD.phone
               THEN nullif(trim(NEW.phone), '')
               ELSE whatsapp_phone
           END,
           updated_at = now()
     WHERE workspace_client_id = NEW.workspace_client_id
       AND id <> NEW.id
       AND anonymized = FALSE;

    -- This catches shared contact updates made outside the authenticated staff API as well.
    INSERT INTO workspace_client_audit_log (
        created_at, updated_at, workspace_id, actor_company_id, action,
        workspace_client_id, client_id, details_json
    )
    SELECT now(), now(), company.workspace_id, NEW.company_id, 'SHARED_IDENTITY_DATABASE_SYNC',
           NEW.workspace_client_id, NEW.id,
           json_build_object(
               'firstNameChanged', OLD.first_name IS DISTINCT FROM NEW.first_name,
               'lastNameChanged', OLD.last_name IS DISTINCT FROM NEW.last_name,
               'emailChanged', OLD.email IS DISTINCT FROM NEW.email,
               'phoneChanged', OLD.phone IS DISTINCT FROM NEW.phone
           )::text
      FROM company
     WHERE company.id = NEW.company_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_clients_sync_workspace_client_identity ON clients;
CREATE TRIGGER trg_clients_sync_workspace_client_identity
AFTER UPDATE OF first_name, last_name, email, phone ON clients
FOR EACH ROW
WHEN (
    OLD.first_name IS DISTINCT FROM NEW.first_name OR
    OLD.last_name IS DISTINCT FROM NEW.last_name OR
    OLD.email IS DISTINCT FROM NEW.email OR
    OLD.phone IS DISTINCT FROM NEW.phone
)
EXECUTE FUNCTION calendra_sync_workspace_client_identity();

-- Files, inbox messages, internal notes, scheduled messages, bookings and invoices remain unit-only.
ALTER TABLE client_files ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'UNIT_ONLY';
ALTER TABLE client_messages ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'UNIT_ONLY';
ALTER TABLE scheduled_messages ADD COLUMN IF NOT EXISTS visibility_scope VARCHAR(20) NOT NULL DEFAULT 'UNIT_ONLY';

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_client_files_visibility_scope') THEN
        ALTER TABLE client_files ADD CONSTRAINT ck_client_files_visibility_scope
            CHECK (visibility_scope = 'UNIT_ONLY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_client_messages_visibility_scope') THEN
        ALTER TABLE client_messages ADD CONSTRAINT ck_client_messages_visibility_scope
            CHECK (visibility_scope = 'UNIT_ONLY');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_scheduled_messages_visibility_scope') THEN
        ALTER TABLE scheduled_messages ADD CONSTRAINT ck_scheduled_messages_visibility_scope
            CHECK (visibility_scope = 'UNIT_ONLY');
    END IF;

    -- Composite foreign keys enforce that unit-owned client data cannot cross company boundaries.
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_files_unit_client') THEN
        ALTER TABLE client_files ADD CONSTRAINT fk_client_files_unit_client
            FOREIGN KEY (client_id, owner_company_id) REFERENCES clients(id, company_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_client_messages_unit_client') THEN
        ALTER TABLE client_messages ADD CONSTRAINT fk_client_messages_unit_client
            FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_scheduled_messages_unit_client') THEN
        ALTER TABLE scheduled_messages ADD CONSTRAINT fk_scheduled_messages_unit_client
            FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_unit_client') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_unit_client
            FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bills_unit_client') THEN
        ALTER TABLE bills ADD CONSTRAINT fk_bills_unit_client
            FOREIGN KEY (client_id, company_id) REFERENCES clients(id, company_id);
    END IF;
END $$;


-- ============================================================================
-- Locations And Workspace Scheduling
-- ============================================================================

-- Phase 3: normalized physical locations and consolidated workspace scheduling.
-- Company remains the isolated operating unit. Space becomes a resource inside one location.

CREATE TABLE IF NOT EXISTS locations (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(512),
    postal_code VARCHAR(64),
    city VARCHAR(255),
    timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Ljubljana',
    phone VARCHAR(128),
    email VARCHAR(320),
    opening_hours_json TEXT,
    public_booking_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    default_location BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    fiscal_business_premise_code VARCHAR(64),
    CONSTRAINT fk_location_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT uq_location_company_name UNIQUE (company_id, name)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_location_default_per_company
    ON locations(company_id) WHERE default_location = TRUE;
CREATE INDEX IF NOT EXISTS idx_location_company_active
    ON locations(company_id, active, default_location DESC, name, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_locations_id_company ON locations(id, company_id);


ALTER TABLE space ADD COLUMN IF NOT EXISTS location_id BIGINT;

ALTER TABLE space
    ADD CONSTRAINT fk_space_location FOREIGN KEY (location_id) REFERENCES locations(id);

ALTER TABLE space ALTER COLUMN location_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_space_location_name ON space(location_id, name);
CREATE INDEX IF NOT EXISTS idx_space_location ON space(location_id, id);

ALTER TABLE session_booking ADD COLUMN IF NOT EXISTS location_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_session_booking_location') THEN
        ALTER TABLE session_booking ADD CONSTRAINT fk_session_booking_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE session_booking ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_session_booking_location_range ON session_booking(location_id, start_time, end_time, id);

ALTER TABLE waitlist_requests
    ADD CONSTRAINT fk_waitlist_request_location FOREIGN KEY (location_id) REFERENCES locations(id);
CREATE INDEX IF NOT EXISTS idx_waitlist_request_location_status
    ON waitlist_requests(company_id, location_id, status, joined_at);

-- Raw SQL provisioning paths receive a default location as soon as a company is inserted.
CREATE OR REPLACE FUNCTION calendra_ensure_company_default_location()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM locations WHERE company_id = NEW.id) THEN
        INSERT INTO locations (
            created_at, updated_at, company_id, name, timezone,
            public_booking_enabled, default_location, active
        ) VALUES (
            COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()), NEW.id,
            COALESCE(NULLIF(trim(NEW.name), ''), 'Location'), 'Europe/Ljubljana', TRUE, TRUE, TRUE
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_ensure_default_location ON company;
CREATE TRIGGER trg_company_ensure_default_location
AFTER INSERT ON company
FOR EACH ROW EXECUTE FUNCTION calendra_ensure_company_default_location();

CREATE OR REPLACE FUNCTION calendra_validate_space_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        SELECT id INTO NEW.location_id FROM locations
         WHERE company_id = NEW.company_id AND default_location = TRUE
         ORDER BY id LIMIT 1;
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Space location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_space_validate_location ON space;
CREATE TRIGGER trg_space_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON space
FOR EACH ROW EXECUTE FUNCTION calendra_validate_space_location();

CREATE OR REPLACE FUNCTION calendra_validate_booking_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
    IF NEW.space_id IS NOT NULL THEN
        SELECT location_id INTO space_location_id FROM space
         WHERE id = NEW.space_id AND company_id = NEW.company_id;
        IF space_location_id IS NULL THEN
            RAISE EXCEPTION 'Booking space % does not belong to company %', NEW.space_id, NEW.company_id;
        END IF;
        IF NEW.location_id IS NULL THEN
            NEW.location_id := space_location_id;
        ELSIF NEW.location_id <> space_location_id THEN
            RAISE EXCEPTION 'Booking space % belongs to location %, not %', NEW.space_id, space_location_id, NEW.location_id;
        END IF;
    END IF;
    IF NEW.location_id IS NULL THEN
        SELECT id INTO NEW.location_id FROM locations
         WHERE company_id = NEW.company_id AND default_location = TRUE
         ORDER BY id LIMIT 1;
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Booking location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_booking_validate_location ON session_booking;
CREATE TRIGGER trg_session_booking_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, space_id ON session_booking
FOR EACH ROW EXECUTE FUNCTION calendra_validate_booking_location();

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Waitlist location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_waitlist_request_validate_location ON waitlist_requests;
CREATE TRIGGER trg_waitlist_request_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON waitlist_requests
FOR EACH ROW EXECUTE FUNCTION calendra_validate_waitlist_location();


CREATE OR REPLACE FUNCTION calendra_validate_session_service_location()
RETURNS trigger AS $$
DECLARE booking_company_id BIGINT;
DECLARE booking_location_id BIGINT;
DECLARE space_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
    IF NEW.space_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id, location_id INTO booking_company_id, booking_location_id
      FROM session_booking WHERE id = NEW.session_booking_id;
    SELECT company_id, location_id INTO space_company_id, space_location_id
      FROM space WHERE id = NEW.space_id;
    IF booking_company_id IS NULL OR space_company_id IS NULL
       OR booking_company_id <> space_company_id OR booking_location_id <> space_location_id THEN
        RAISE EXCEPTION 'Session service space % does not belong to booking location %', NEW.space_id, booking_location_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_session_service_validate_location ON session_service;
CREATE TRIGGER trg_session_service_validate_location
BEFORE INSERT OR UPDATE OF session_booking_id, space_id ON session_service
FOR EACH ROW EXECUTE FUNCTION calendra_validate_session_service_location();


-- ============================================================================
-- Integrity Trigger Sqlstates
-- ============================================================================

-- Ensure ownership-validation triggers report PostgreSQL integrity SQLSTATEs.
-- Spring translates SQLSTATE class 23 into DataIntegrityViolationException.

CREATE OR REPLACE FUNCTION calendra_ensure_workspace_client_link()
RETURNS trigger AS $$
DECLARE
    expected_workspace_id BIGINT;
    linked_workspace_id BIGINT;
    identity_seed TEXT;
BEGIN
    SELECT workspace_id INTO expected_workspace_id FROM company WHERE id = NEW.company_id;
    IF expected_workspace_id IS NULL THEN
        RAISE EXCEPTION 'Cannot resolve workspace for company %', NEW.company_id
            USING ERRCODE = '23503';
    END IF;

    IF NEW.workspace_client_id IS NULL THEN
        identity_seed := 'workspace-client-new:' || expected_workspace_id::text || ':' ||
                coalesce(NEW.id::text, clock_timestamp()::text || random()::text);
        INSERT INTO workspace_clients (
            created_at, updated_at, workspace_id, public_id, first_name, last_name,
            email, phone, normalized_email, normalized_phone, status
        ) VALUES (
            COALESCE(NEW.created_at, now()),
            COALESCE(NEW.updated_at, now()),
            expected_workspace_id,
            substr(md5(identity_seed), 1, 8) || '-' ||
            substr(md5(identity_seed), 9, 4) || '-' ||
            substr(md5(identity_seed), 13, 4) || '-' ||
            substr(md5(identity_seed), 17, 4) || '-' ||
            substr(md5(identity_seed), 21, 12),
            NEW.first_name,
            NEW.last_name,
            nullif(lower(trim(NEW.email)), ''),
            nullif(trim(NEW.phone), ''),
            nullif(lower(trim(NEW.email)), ''),
            nullif(regexp_replace(coalesce(NEW.phone, ''), '[^0-9]', '', 'g'), ''),
            CASE WHEN NEW.anonymized THEN 'ANONYMIZED' ELSE 'ACTIVE' END
        ) RETURNING id INTO NEW.workspace_client_id;

        INSERT INTO workspace_client_audit_log (
            created_at, updated_at, workspace_id, actor_company_id, action,
            workspace_client_id, client_id, details_json
        ) VALUES (
            now(), now(), expected_workspace_id, NEW.company_id, 'WORKSPACE_CLIENT_DATABASE_CREATED',
            NEW.workspace_client_id, null, json_build_object('rawClientId', NEW.id)::text
        );
    ELSE
        SELECT workspace_id INTO linked_workspace_id
          FROM workspace_clients
         WHERE id = NEW.workspace_client_id;
        IF linked_workspace_id IS NULL THEN
            RAISE EXCEPTION 'Workspace client % does not exist', NEW.workspace_client_id
                USING ERRCODE = '23503';
        END IF;
        IF linked_workspace_id <> expected_workspace_id THEN
            RAISE EXCEPTION 'Workspace client % belongs to workspace %, not %',
                NEW.workspace_client_id, linked_workspace_id, expected_workspace_id
                USING ERRCODE = '23514';
        END IF;
        IF TG_OP = 'UPDATE' AND OLD.workspace_client_id IS DISTINCT FROM NEW.workspace_client_id THEN
            INSERT INTO workspace_client_audit_log (
                created_at, updated_at, workspace_id, actor_company_id, action,
                workspace_client_id, related_workspace_client_id, client_id, details_json
            ) VALUES (
                now(), now(), expected_workspace_id, NEW.company_id, 'WORKSPACE_CLIENT_DATABASE_LINK_CHANGED',
                NEW.workspace_client_id, OLD.workspace_client_id, NEW.id,
                json_build_object('oldWorkspaceClientId', OLD.workspace_client_id,
                                  'newWorkspaceClientId', NEW.workspace_client_id)::text
            );
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_space_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        SELECT id INTO NEW.location_id FROM locations
         WHERE company_id = NEW.company_id AND default_location = TRUE
         ORDER BY id LIMIT 1;
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Space location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_booking_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
    IF NEW.space_id IS NOT NULL THEN
        SELECT location_id INTO space_location_id FROM space
         WHERE id = NEW.space_id AND company_id = NEW.company_id;
        IF space_location_id IS NULL THEN
            RAISE EXCEPTION 'Booking space % does not belong to company %', NEW.space_id, NEW.company_id
                USING ERRCODE = '23514';
        END IF;
        IF NEW.location_id IS NULL THEN
            NEW.location_id := space_location_id;
        ELSIF NEW.location_id <> space_location_id THEN
            RAISE EXCEPTION 'Booking space % belongs to location %, not %', NEW.space_id, space_location_id, NEW.location_id
                USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.location_id IS NULL THEN
        SELECT id INTO NEW.location_id FROM locations
         WHERE company_id = NEW.company_id AND default_location = TRUE
         ORDER BY id LIMIT 1;
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Booking location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Waitlist location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_session_service_location()
RETURNS trigger AS $$
DECLARE booking_company_id BIGINT;
DECLARE booking_location_id BIGINT;
DECLARE space_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
    IF NEW.space_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id, location_id INTO booking_company_id, booking_location_id
      FROM session_booking WHERE id = NEW.session_booking_id;
    SELECT company_id, location_id INTO space_company_id, space_location_id
      FROM space WHERE id = NEW.space_id;
    IF booking_company_id IS NULL OR space_company_id IS NULL
       OR booking_company_id <> space_company_id OR booking_location_id <> space_location_id THEN
        RAISE EXCEPTION 'Session service space % does not belong to booking location %', NEW.space_id, booking_location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- Legal Entities Invoice Series And Issuer Snapshots
-- ============================================================================

-- Phase 4: workspace legal entities, assignable invoice issuers and normalized invoice series.
-- Companies remain operating/security units. Bills keep immutable issuer and numbering snapshots and
-- receive immutable issuer/series/location snapshots without being renumbered.

CREATE TABLE IF NOT EXISTS legal_entities (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    name VARCHAR(255) NOT NULL,
    address VARCHAR(512),
    postal_code VARCHAR(64),
    city VARCHAR(255),
    country VARCHAR(2) NOT NULL DEFAULT 'SI',
    tax_number VARCHAR(64),
    vat_id VARCHAR(64),
    iban VARCHAR(128),
    bic VARCHAR(64),
    email VARCHAR(320),
    telephone VARCHAR(128),
    currency VARCHAR(3) NOT NULL DEFAULT 'EUR',
    fiscal_environment VARCHAR(16) NOT NULL DEFAULT 'TEST',
    software_supplier_tax_number VARCHAR(64),
    certificate_password_encrypted TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_legal_entity_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT ck_legal_entity_country CHECK (char_length(country) = 2),
    CONSTRAINT ck_legal_entity_currency CHECK (char_length(currency) = 3),
    CONSTRAINT ck_legal_entity_fiscal_environment CHECK (fiscal_environment IN ('TEST', 'PROD'))
);
CREATE INDEX IF NOT EXISTS idx_legal_entity_workspace_active
    ON legal_entities(workspace_id, active, name, id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_legal_entities_id_workspace ON legal_entities(id, workspace_id);


CREATE TABLE IF NOT EXISTS company_legal_entities (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    legal_entity_id BIGINT NOT NULL,
    default_issuer BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    default_invoice_series_id BIGINT,
    CONSTRAINT fk_company_legal_entity_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_company_legal_entity_legal FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
    CONSTRAINT uq_company_legal_entity UNIQUE (company_id, legal_entity_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_company_default_legal_entity
    ON company_legal_entities(company_id) WHERE default_issuer = TRUE AND active = TRUE;
CREATE INDEX IF NOT EXISTS idx_company_legal_entity_lookup
    ON company_legal_entities(company_id, active, default_issuer DESC, legal_entity_id);

CREATE TABLE IF NOT EXISTS invoice_series (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    workspace_id BIGINT NOT NULL,
    legal_entity_id BIGINT NOT NULL,
    company_id BIGINT,
    location_id BIGINT,
    name VARCHAR(255) NOT NULL,
    next_number VARCHAR(255) NOT NULL,
    initial_number VARCHAR(255) NOT NULL DEFAULT '1',
    reset_policy VARCHAR(16) NOT NULL DEFAULT 'NONE',
    last_reset_year INTEGER,
    business_premise_code VARCHAR(64),
    electronic_device_id VARCHAR(64),
    active BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT fk_invoice_series_workspace FOREIGN KEY (workspace_id) REFERENCES workspaces(id),
    CONSTRAINT fk_invoice_series_legal_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id),
    CONSTRAINT fk_invoice_series_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_invoice_series_location FOREIGN KEY (location_id) REFERENCES locations(id),
    CONSTRAINT uq_invoice_series_legal_name UNIQUE (legal_entity_id, name),
    CONSTRAINT ck_invoice_series_reset_policy CHECK (reset_policy IN ('NONE', 'YEARLY')),
    CONSTRAINT ck_invoice_series_location_scope CHECK (location_id IS NULL OR company_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_invoice_series_legal_active
    ON invoice_series(legal_entity_id, active, company_id, location_id, name, id);
CREATE INDEX IF NOT EXISTS idx_invoice_series_company_active
    ON invoice_series(company_id, active, location_id, id);


DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_company_legal_entity_default_series') THEN
        ALTER TABLE company_legal_entities
            ADD CONSTRAINT fk_company_legal_entity_default_series
            FOREIGN KEY (default_invoice_series_id) REFERENCES invoice_series(id);
    END IF;
END $$;

ALTER TABLE locations ADD COLUMN IF NOT EXISTS default_legal_entity_id BIGINT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_location_default_legal_entity') THEN
        ALTER TABLE locations
            ADD CONSTRAINT fk_location_default_legal_entity
            FOREIGN KEY (default_legal_entity_id) REFERENCES legal_entities(id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_location_default_legal_entity ON locations(default_legal_entity_id, company_id);

ALTER TABLE bills ADD COLUMN IF NOT EXISTS legal_entity_id BIGINT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS invoice_series_id BIGINT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS location_id BIGINT;
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_name_snapshot VARCHAR(255);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_address_snapshot VARCHAR(512);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_postal_code_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_city_snapshot VARCHAR(255);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_country_snapshot VARCHAR(2);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_tax_number_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_vat_id_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_iban_snapshot VARCHAR(128);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_bic_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_email_snapshot VARCHAR(320);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS issuer_telephone_snapshot VARCHAR(128);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS invoice_series_name_snapshot VARCHAR(255);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS fiscal_business_premise_snapshot VARCHAR(64);
ALTER TABLE bills ADD COLUMN IF NOT EXISTS fiscal_device_id_snapshot VARCHAR(64);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bill_legal_entity') THEN
        ALTER TABLE bills ADD CONSTRAINT fk_bill_legal_entity FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bill_invoice_series') THEN
        ALTER TABLE bills ADD CONSTRAINT fk_bill_invoice_series FOREIGN KEY (invoice_series_id) REFERENCES invoice_series(id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bill_location') THEN
        ALTER TABLE bills ADD CONSTRAINT fk_bill_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;

ALTER TABLE bills ALTER COLUMN legal_entity_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN invoice_series_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE bills ALTER COLUMN issuer_name_snapshot SET NOT NULL;
ALTER TABLE bills ALTER COLUMN invoice_series_name_snapshot SET NOT NULL;
DROP INDEX IF EXISTS ux_bills_company_bill_number;
CREATE UNIQUE INDEX IF NOT EXISTS ux_bills_invoice_series_bill_number
    ON bills(invoice_series_id, bill_number);
CREATE INDEX IF NOT EXISTS idx_bills_workspace_issuer_history
    ON bills(legal_entity_id, issue_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_bills_invoice_series_history
    ON bills(invoice_series_id, issue_date DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_bills_location_history
    ON bills(location_id, issue_date DESC, id DESC);

ALTER TABLE fiscal_certificates ADD COLUMN IF NOT EXISTS legal_entity_id BIGINT;

ALTER TABLE fiscal_certificates
    ADD CONSTRAINT fk_fiscal_certificate_legal_entity
    FOREIGN KEY (legal_entity_id) REFERENCES legal_entities(id);
ALTER TABLE fiscal_certificates ALTER COLUMN legal_entity_id SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fiscal_certificate_legal_entity ON fiscal_certificates(legal_entity_id);

CREATE OR REPLACE FUNCTION calendra_validate_invoice_series_scope()
RETURNS trigger AS $$
DECLARE
    legal_workspace BIGINT;
    company_workspace BIGINT;
    location_company BIGINT;
BEGIN
    SELECT workspace_id INTO legal_workspace FROM legal_entities WHERE id = NEW.legal_entity_id;
    IF legal_workspace IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = format('Legal entity %s does not exist', NEW.legal_entity_id);
    END IF;
    IF legal_workspace <> NEW.workspace_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = format('Invoice series workspace %s does not match legal entity workspace %s', NEW.workspace_id, legal_workspace);
    END IF;
    IF NEW.company_id IS NOT NULL THEN
        SELECT workspace_id INTO company_workspace FROM company WHERE id = NEW.company_id;
        IF company_workspace IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = format('Company %s does not exist', NEW.company_id);
        END IF;
        IF company_workspace <> NEW.workspace_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series company belongs to another workspace';
        END IF;
        IF NOT EXISTS (
            SELECT 1 FROM company_legal_entities cle
             WHERE cle.company_id = NEW.company_id
               AND cle.legal_entity_id = NEW.legal_entity_id
               AND cle.active = TRUE
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series legal entity is not assigned to its company';
        END IF;
    END IF;
    IF NEW.location_id IS NOT NULL THEN
        SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
        IF location_company IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = format('Location %s does not exist', NEW.location_id);
        END IF;
        IF NEW.company_id IS NULL OR location_company <> NEW.company_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Location-specific invoice series must belong to the same company';
        END IF;
    END IF;
    IF EXISTS (SELECT 1 FROM company_legal_entities cle WHERE cle.default_invoice_series_id = NEW.id) THEN
        IF NEW.active IS NOT TRUE THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A default invoice series must remain active';
        END IF;
        IF NEW.location_id IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A unit-wide default invoice series cannot be location-specific';
        END IF;
        IF NEW.company_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM company_legal_entities cle
             WHERE cle.default_invoice_series_id = NEW.id
               AND cle.company_id <> NEW.company_id
        ) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A shared default invoice series cannot be reassigned to one operating unit';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_invoice_series_scope ON invoice_series;
CREATE TRIGGER trg_invoice_series_scope
BEFORE INSERT OR UPDATE OF workspace_id, legal_entity_id, company_id, location_id, active
ON invoice_series FOR EACH ROW EXECUTE FUNCTION calendra_validate_invoice_series_scope();

CREATE OR REPLACE FUNCTION calendra_validate_company_legal_entity_assignment()
RETURNS trigger AS $$
DECLARE
    company_workspace BIGINT;
    legal_workspace BIGINT;
    legal_active BOOLEAN;
    series_legal BIGINT;
    series_company BIGINT;
    series_location BIGINT;
    series_active BOOLEAN;
BEGIN
    SELECT workspace_id INTO company_workspace FROM company WHERE id = NEW.company_id;
    SELECT workspace_id, active INTO legal_workspace, legal_active FROM legal_entities WHERE id = NEW.legal_entity_id;
    IF company_workspace IS NULL OR legal_workspace IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Company or legal entity does not exist';
    END IF;
    IF company_workspace <> legal_workspace THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A legal entity can only be assigned inside its workspace';
    END IF;
    IF NEW.active IS TRUE AND legal_active IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'An inactive legal entity cannot have an active operating-unit assignment';
    END IF;
    IF NEW.default_issuer IS TRUE AND NEW.active IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'The default issuer assignment must remain active';
    END IF;
    IF NEW.active IS NOT TRUE AND EXISTS (
        SELECT 1 FROM locations l
         WHERE l.company_id = NEW.company_id
           AND l.default_legal_entity_id = NEW.legal_entity_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Change location default issuers before deactivating this assignment';
    END IF;
    IF NEW.default_invoice_series_id IS NOT NULL THEN
        SELECT legal_entity_id, company_id, location_id, active
          INTO series_legal, series_company, series_location, series_active
          FROM invoice_series WHERE id = NEW.default_invoice_series_id;
        IF series_legal IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Default invoice series does not exist';
        END IF;
        IF series_legal <> NEW.legal_entity_id OR (series_company IS NOT NULL AND series_company <> NEW.company_id) THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Default invoice series is not valid for this company and legal entity';
        END IF;
        IF series_active IS NOT TRUE THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Default invoice series must be active';
        END IF;
        IF series_location IS NOT NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'A unit-wide default invoice series cannot be location-specific';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_company_legal_entity_assignment ON company_legal_entities;
CREATE TRIGGER trg_company_legal_entity_assignment
BEFORE INSERT OR UPDATE OF company_id, legal_entity_id, default_invoice_series_id, default_issuer, active
ON company_legal_entities FOR EACH ROW EXECUTE FUNCTION calendra_validate_company_legal_entity_assignment();

CREATE OR REPLACE FUNCTION calendra_prevent_location_issuer_assignment_delete()
RETURNS trigger AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM locations l
         WHERE l.company_id = OLD.company_id
           AND l.default_legal_entity_id = OLD.legal_entity_id
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Change location default issuers before removing this assignment';
    END IF;
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_company_legal_entity_delete ON company_legal_entities;
CREATE TRIGGER trg_company_legal_entity_delete
BEFORE DELETE ON company_legal_entities
FOR EACH ROW EXECUTE FUNCTION calendra_prevent_location_issuer_assignment_delete();

CREATE OR REPLACE FUNCTION calendra_validate_legal_entity_activation()
RETURNS trigger AS $$
BEGIN
    IF NEW.active IS NOT TRUE AND OLD.active IS TRUE AND EXISTS (
        SELECT 1 FROM company_legal_entities cle
         WHERE cle.legal_entity_id = NEW.id AND cle.active = TRUE
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Deactivate all operating-unit issuer assignments before deactivating the legal entity';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_legal_entity_activation ON legal_entities;
CREATE TRIGGER trg_legal_entity_activation
BEFORE UPDATE OF active ON legal_entities
FOR EACH ROW EXECUTE FUNCTION calendra_validate_legal_entity_activation();

CREATE OR REPLACE FUNCTION calendra_validate_location_default_issuer()
RETURNS trigger AS $$
DECLARE
    issuer_active BOOLEAN;
BEGIN
    IF NEW.default_legal_entity_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT active INTO issuer_active FROM legal_entities WHERE id = NEW.default_legal_entity_id;
    IF issuer_active IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Default location invoice issuer does not exist';
    END IF;
    IF issuer_active IS NOT TRUE OR NOT EXISTS (
        SELECT 1 FROM company_legal_entities cle
         WHERE cle.company_id = NEW.company_id
           AND cle.legal_entity_id = NEW.default_legal_entity_id
           AND cle.active = TRUE
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Default location invoice issuer is not active and assigned to the operating unit';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_location_default_issuer ON locations;
CREATE TRIGGER trg_location_default_issuer
BEFORE INSERT OR UPDATE OF company_id, default_legal_entity_id ON locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_location_default_issuer();

-- Provision a default issuer, series and branch for newly created companies.
-- This also covers raw SQL/load-test provisioning paths that bypass JPA services.
CREATE OR REPLACE FUNCTION calendra_ensure_company_invoice_foundation()
RETURNS trigger AS $$
DECLARE
    legal_id BIGINT;
    series_id BIGINT;
    default_location_id BIGINT;
BEGIN
    SELECT cle.legal_entity_id INTO legal_id
      FROM company_legal_entities cle
     WHERE cle.company_id = NEW.id AND cle.default_issuer = TRUE AND cle.active = TRUE
     ORDER BY cle.id LIMIT 1;

    IF legal_id IS NULL THEN
        INSERT INTO legal_entities (
            created_at, updated_at, workspace_id, name, country, currency,
            fiscal_environment, active
        ) VALUES (
            COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()), NEW.workspace_id,
            COALESCE(NULLIF(NEW.name, ''), 'Operating unit ' || NEW.id), 'SI', 'EUR', 'TEST', TRUE
        ) RETURNING id INTO legal_id;

        INSERT INTO company_legal_entities (
            created_at, updated_at, company_id, legal_entity_id, default_issuer, active
        ) VALUES (now(), now(), NEW.id, legal_id, TRUE, TRUE);
    END IF;

    SELECT id INTO default_location_id
      FROM locations
     WHERE company_id = NEW.id
     ORDER BY default_location DESC, id ASC
     LIMIT 1;

    IF default_location_id IS NULL THEN
        INSERT INTO locations (
            created_at, updated_at, company_id, name, timezone,
            default_location, active, public_booking_enabled, default_legal_entity_id
        ) VALUES (
            now(), now(), NEW.id, COALESCE(NULLIF(NEW.name, ''), 'Default location'),
            'Europe/Ljubljana', TRUE, TRUE, TRUE, legal_id
        ) RETURNING id INTO default_location_id;
    ELSE
        UPDATE locations
           SET default_legal_entity_id = COALESCE(default_legal_entity_id, legal_id),
               updated_at = now()
         WHERE id = default_location_id;
    END IF;

    SELECT cle.default_invoice_series_id INTO series_id
      FROM company_legal_entities cle
     WHERE cle.company_id = NEW.id AND cle.legal_entity_id = legal_id;

    IF series_id IS NULL THEN
        INSERT INTO invoice_series (
            created_at, updated_at, workspace_id, legal_entity_id, company_id, location_id,
            name, next_number, initial_number, reset_policy, last_reset_year,
            business_premise_code, electronic_device_id, active
        ) VALUES (
            now(), now(), NEW.workspace_id, legal_id, NEW.id, NULL,
            'Default', '1', '1', 'NONE', EXTRACT(YEAR FROM CURRENT_DATE)::INTEGER,
            (SELECT fiscal_business_premise_code FROM locations WHERE id = default_location_id),
            NULL, TRUE
        ) RETURNING id INTO series_id;

        UPDATE company_legal_entities
           SET default_invoice_series_id = series_id, updated_at = now()
         WHERE company_id = NEW.id AND legal_entity_id = legal_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_company_ensure_invoice_foundation ON company;
CREATE TRIGGER trg_company_ensure_invoice_foundation
AFTER INSERT ON company
FOR EACH ROW EXECUTE FUNCTION calendra_ensure_company_invoice_foundation();

CREATE OR REPLACE FUNCTION calendra_prepare_bill_issuer()
RETURNS trigger AS $$
DECLARE
    company_workspace BIGINT;
    resolved_legal_entity_id BIGINT;
    resolved_invoice_series_id BIGINT;
    resolved_location_id BIGINT;
    resolved_legal legal_entities%ROWTYPE;
    resolved_series invoice_series%ROWTYPE;
    resolved_location_company BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.company_id IS DISTINCT FROM NEW.company_id
           OR OLD.bill_number IS DISTINCT FROM NEW.bill_number
           OR OLD.legal_entity_id IS DISTINCT FROM NEW.legal_entity_id
           OR OLD.invoice_series_id IS DISTINCT FROM NEW.invoice_series_id
           OR OLD.location_id IS DISTINCT FROM NEW.location_id
           OR OLD.issuer_name_snapshot IS DISTINCT FROM NEW.issuer_name_snapshot
           OR OLD.issuer_address_snapshot IS DISTINCT FROM NEW.issuer_address_snapshot
           OR OLD.issuer_postal_code_snapshot IS DISTINCT FROM NEW.issuer_postal_code_snapshot
           OR OLD.issuer_city_snapshot IS DISTINCT FROM NEW.issuer_city_snapshot
           OR OLD.issuer_country_snapshot IS DISTINCT FROM NEW.issuer_country_snapshot
           OR OLD.issuer_tax_number_snapshot IS DISTINCT FROM NEW.issuer_tax_number_snapshot
           OR OLD.issuer_vat_id_snapshot IS DISTINCT FROM NEW.issuer_vat_id_snapshot
           OR OLD.issuer_iban_snapshot IS DISTINCT FROM NEW.issuer_iban_snapshot
           OR OLD.issuer_bic_snapshot IS DISTINCT FROM NEW.issuer_bic_snapshot
           OR OLD.issuer_email_snapshot IS DISTINCT FROM NEW.issuer_email_snapshot
           OR OLD.issuer_telephone_snapshot IS DISTINCT FROM NEW.issuer_telephone_snapshot
           OR OLD.invoice_series_name_snapshot IS DISTINCT FROM NEW.invoice_series_name_snapshot
           OR OLD.fiscal_business_premise_snapshot IS DISTINCT FROM NEW.fiscal_business_premise_snapshot
           OR OLD.fiscal_device_id_snapshot IS DISTINCT FROM NEW.fiscal_device_id_snapshot THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Issued invoice identity and issuer snapshots are immutable';
        END IF;
        RETURN NEW;
    END IF;

    SELECT workspace_id INTO company_workspace FROM company WHERE id = NEW.company_id;
    IF company_workspace IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = format('Company %s does not exist', NEW.company_id);
    END IF;

    IF NEW.legal_entity_id IS NULL THEN
        SELECT cle.legal_entity_id INTO resolved_legal_entity_id
          FROM company_legal_entities cle
         WHERE cle.company_id = NEW.company_id AND cle.active = TRUE
         ORDER BY cle.default_issuer DESC, cle.id ASC
         LIMIT 1;
        NEW.legal_entity_id := resolved_legal_entity_id;
    END IF;
    IF NEW.invoice_series_id IS NULL THEN
        SELECT COALESCE(
                   (SELECT cle.default_invoice_series_id
                      FROM company_legal_entities cle
                     WHERE cle.company_id = NEW.company_id
                       AND cle.legal_entity_id = NEW.legal_entity_id
                       AND cle.active = TRUE),
                   (SELECT series.id
                      FROM invoice_series series
                     WHERE series.legal_entity_id = NEW.legal_entity_id
                       AND series.active = TRUE
                       AND (series.company_id IS NULL OR series.company_id = NEW.company_id)
                     ORDER BY CASE WHEN series.company_id = NEW.company_id THEN 0 ELSE 1 END, series.id
                     LIMIT 1)
               ) INTO resolved_invoice_series_id;
        NEW.invoice_series_id := resolved_invoice_series_id;
    END IF;
    IF NEW.location_id IS NULL THEN
        SELECT id INTO resolved_location_id FROM locations
         WHERE company_id = NEW.company_id
         ORDER BY default_location DESC, id ASC LIMIT 1;
        NEW.location_id := resolved_location_id;
    END IF;

    SELECT * INTO resolved_legal FROM legal_entities WHERE id = NEW.legal_entity_id;
    SELECT * INTO resolved_series FROM invoice_series WHERE id = NEW.invoice_series_id;
    SELECT company_id INTO resolved_location_company FROM locations WHERE id = NEW.location_id;
    IF resolved_legal.id IS NULL OR resolved_series.id IS NULL OR resolved_location_company IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Unable to resolve invoice issuer, series or location';
    END IF;
    IF resolved_legal.workspace_id <> company_workspace THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice issuer belongs to another workspace';
    END IF;
    IF resolved_legal.active IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice issuer is inactive';
    END IF;
    IF resolved_series.active IS NOT TRUE THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series is inactive';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM company_legal_entities cle
         WHERE cle.company_id = NEW.company_id
           AND cle.legal_entity_id = NEW.legal_entity_id
           AND cle.active = TRUE
    ) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice issuer is not assigned to the operating unit';
    END IF;
    IF resolved_series.legal_entity_id <> NEW.legal_entity_id
       OR (resolved_series.company_id IS NOT NULL AND resolved_series.company_id <> NEW.company_id) THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series is not valid for the selected issuer and operating unit';
    END IF;
    IF resolved_series.location_id IS NOT NULL AND resolved_series.location_id <> NEW.location_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice series is restricted to another location';
    END IF;
    IF resolved_location_company <> NEW.company_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Invoice location belongs to another operating unit';
    END IF;

    NEW.issuer_name_snapshot := COALESCE(NEW.issuer_name_snapshot, resolved_legal.name);
    NEW.issuer_address_snapshot := COALESCE(NEW.issuer_address_snapshot, resolved_legal.address);
    NEW.issuer_postal_code_snapshot := COALESCE(NEW.issuer_postal_code_snapshot, resolved_legal.postal_code);
    NEW.issuer_city_snapshot := COALESCE(NEW.issuer_city_snapshot, resolved_legal.city);
    NEW.issuer_country_snapshot := COALESCE(NEW.issuer_country_snapshot, resolved_legal.country);
    NEW.issuer_tax_number_snapshot := COALESCE(NEW.issuer_tax_number_snapshot, resolved_legal.tax_number);
    NEW.issuer_vat_id_snapshot := COALESCE(NEW.issuer_vat_id_snapshot, resolved_legal.vat_id);
    NEW.issuer_iban_snapshot := COALESCE(NEW.issuer_iban_snapshot, resolved_legal.iban);
    NEW.issuer_bic_snapshot := COALESCE(NEW.issuer_bic_snapshot, resolved_legal.bic);
    NEW.issuer_email_snapshot := COALESCE(NEW.issuer_email_snapshot, resolved_legal.email);
    NEW.issuer_telephone_snapshot := COALESCE(NEW.issuer_telephone_snapshot, resolved_legal.telephone);
    NEW.invoice_series_name_snapshot := COALESCE(NEW.invoice_series_name_snapshot, resolved_series.name);
    NEW.fiscal_business_premise_snapshot := COALESCE(NEW.fiscal_business_premise_snapshot, resolved_series.business_premise_code);
    NEW.fiscal_device_id_snapshot := COALESCE(NEW.fiscal_device_id_snapshot, resolved_series.electronic_device_id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_prepare_bill_issuer ON bills;
CREATE TRIGGER trg_prepare_bill_issuer
BEFORE INSERT OR UPDATE ON bills
FOR EACH ROW EXECUTE FUNCTION calendra_prepare_bill_issuer();


-- ============================================================================
-- Workspace Service Templates And Configuration Copy
-- ============================================================================

CREATE TABLE workspace_service_templates (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id),
    owner_company_id BIGINT NOT NULL REFERENCES company(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    default_duration_minutes INTEGER,
    color VARCHAR(20),
    icon VARCHAR(80),
    booking_instructions TEXT,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE session_type
    ADD COLUMN workspace_service_template_id BIGINT;

ALTER TABLE session_type
    ADD COLUMN available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE session_type_locations (
    session_type_id BIGINT NOT NULL REFERENCES session_type(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (session_type_id, location_id)
);

CREATE INDEX idx_session_type_locations_location
    ON session_type_locations(location_id, session_type_id);

CREATE OR REPLACE FUNCTION calendra_validate_session_type_location()
RETURNS trigger AS $$
DECLARE
    service_company_id BIGINT;
    location_company_id BIGINT;
BEGIN
    SELECT company_id INTO service_company_id FROM session_type WHERE id = NEW.session_type_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF service_company_id IS NULL OR location_company_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Service or location does not exist';
    END IF;
    IF service_company_id <> location_company_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Service location belongs to another operating unit';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_session_type_location
BEFORE INSERT OR UPDATE OF session_type_id, location_id ON session_type_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_session_type_location();

ALTER TABLE session_type
    ADD CONSTRAINT fk_session_type_workspace_service_template
    FOREIGN KEY (workspace_service_template_id)
    REFERENCES workspace_service_templates(id)
   ;

ALTER TABLE session_type
    VALIDATE CONSTRAINT fk_session_type_workspace_service_template;

CREATE OR REPLACE FUNCTION calendra_validate_session_type_workspace_template()
RETURNS trigger AS $$
DECLARE
    unit_workspace_id BIGINT;
    template_workspace_id BIGINT;
    created_template_id BIGINT;
BEGIN
    SELECT workspace_id INTO unit_workspace_id FROM company WHERE id = NEW.company_id;
    IF unit_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Session type company does not exist';
    END IF;

    IF NEW.workspace_service_template_id IS NULL THEN
        INSERT INTO workspace_service_templates (
            workspace_id, owner_company_id, name, description, default_duration_minutes, color, active, created_at, updated_at
        ) VALUES (
            unit_workspace_id,
            NEW.company_id,
            COALESCE(NULLIF(BTRIM(NEW.description), ''), NEW.name, 'Service'),
            NEW.description,
            NEW.duration_minutes,
            NEW.color,
            TRUE,
            NOW(),
            NOW()
        ) RETURNING id INTO created_template_id;
        NEW.workspace_service_template_id := created_template_id;
        RETURN NEW;
    END IF;

    SELECT workspace_id INTO template_workspace_id
      FROM workspace_service_templates
     WHERE id = NEW.workspace_service_template_id;

    IF template_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Workspace service template does not exist';
    END IF;
    IF template_workspace_id <> unit_workspace_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace service template belongs to another workspace';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_workspace_service_template_owner()
RETURNS trigger AS $$
DECLARE
    owner_workspace_id BIGINT;
BEGIN
    SELECT workspace_id INTO owner_workspace_id FROM company WHERE id = NEW.owner_company_id;
    IF owner_workspace_id IS NULL THEN
        RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Workspace service owner unit does not exist';
    END IF;
    IF owner_workspace_id <> NEW.workspace_id THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace service owner belongs to another workspace';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_workspace_service_template_owner ON workspace_service_templates;
CREATE TRIGGER trg_validate_workspace_service_template_owner
BEFORE INSERT OR UPDATE OF workspace_id, owner_company_id ON workspace_service_templates
FOR EACH ROW EXECUTE FUNCTION calendra_validate_workspace_service_template_owner();

DROP TRIGGER IF EXISTS trg_validate_session_type_workspace_template ON session_type;
CREATE TRIGGER trg_validate_session_type_workspace_template
BEFORE INSERT OR UPDATE OF company_id, workspace_service_template_id ON session_type
FOR EACH ROW EXECUTE FUNCTION calendra_validate_session_type_workspace_template();

CREATE INDEX idx_session_type_workspace_service_template
    ON session_type(workspace_service_template_id);

CREATE UNIQUE INDEX uq_session_type_company_workspace_template
    ON session_type(company_id, workspace_service_template_id)
    WHERE workspace_service_template_id IS NOT NULL;

CREATE TABLE workspace_service_audit_log (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id),
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    actor_company_id BIGINT REFERENCES company(id) ON DELETE SET NULL,
    workspace_service_template_id BIGINT REFERENCES workspace_service_templates(id) ON DELETE SET NULL,
    session_type_id BIGINT REFERENCES session_type(id) ON DELETE SET NULL,
    action VARCHAR(48) NOT NULL,
    details_json TEXT NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_workspace_service_audit_workspace_created
    ON workspace_service_audit_log(workspace_id, created_at DESC);

CREATE TABLE configuration_copy_audit_log (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id),
    source_company_id BIGINT NOT NULL REFERENCES company(id),
    target_company_id BIGINT NOT NULL REFERENCES company(id),
    actor_user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    categories_json TEXT NOT NULL,
    result_json TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_configuration_copy_audit_workspace_created
    ON configuration_copy_audit_log(workspace_id, created_at DESC);


-- ============================================================================
-- Workspace Analytics Indexes
-- ============================================================================

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


-- ============================================================================
-- Workspace Public Booking
-- ============================================================================

CREATE TABLE IF NOT EXISTS workspace_public_booking_settings (
    id BIGSERIAL PRIMARY KEY,
    workspace_id BIGINT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    slug VARCHAR(80) NOT NULL,
    enabled BOOLEAN NOT NULL DEFAULT FALSE,
    location_selection_mode VARCHAR(24) NOT NULL DEFAULT 'LOCATION_FIRST',
    allow_any_location BOOLEAN NOT NULL DEFAULT TRUE,
    show_prices BOOLEAN NOT NULL DEFAULT TRUE,
    allow_employee_selection BOOLEAN NOT NULL DEFAULT TRUE,
    default_language VARCHAR(8) NOT NULL DEFAULT 'sl',
    primary_color VARCHAR(20),
    logo_url VARCHAR(512),
    page_title VARCHAR(180),
    introduction TEXT,
    confirmation_text TEXT,
    privacy_url VARCHAR(512),
    terms_url VARCHAR(512),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT ck_workspace_public_booking_selection_mode
        CHECK (location_selection_mode IN ('LOCATION_FIRST', 'SERVICE_FIRST')),
    CONSTRAINT ck_workspace_public_booking_language
        CHECK (default_language IN ('sl', 'en', 'sr'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_workspace_public_booking_slug_lower
    ON workspace_public_booking_settings (LOWER(slug));

ALTER TABLE company
    ADD COLUMN IF NOT EXISTS workspace_public_booking_enabled BOOLEAN NOT NULL DEFAULT TRUE;

CREATE INDEX IF NOT EXISTS ix_company_workspace_public_booking
    ON company (workspace_id, workspace_public_booking_enabled, id);
CREATE INDEX IF NOT EXISTS ix_location_public_workspace_booking
    ON locations (company_id, active, public_booking_enabled, id);
CREATE INDEX IF NOT EXISTS ix_session_type_workspace_public_booking
    ON session_type (company_id, active, widget_group_booking_enabled, workspace_service_template_id, id);


-- ============================================================================
-- Workspace Subscription Ownership And Entitlements
-- ============================================================================

-- Workspace subscriptions: canonical production schema.
-- One subscription per workspace; the billing owner is a normal current-model relation.

CREATE TABLE IF NOT EXISTS workspace_subscriptions (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id BIGINT NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE CASCADE,
    billing_owner_company_id BIGINT REFERENCES company(id) ON DELETE SET NULL,
    payer_legal_entity_id BIGINT REFERENCES legal_entities(id) ON DELETE SET NULL,
    plan_key VARCHAR(32) NOT NULL DEFAULT 'PROFESSIONAL',
    billing_interval VARCHAR(16) NOT NULL DEFAULT 'MONTHLY',
    status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
    current_period_start DATE,
    current_period_end DATE,
    trial_ends_at DATE,
    grace_until DATE,
    external_customer_id VARCHAR(255),
    external_subscription_id VARCHAR(255),
    billing_contact_name VARCHAR(255),
    billing_email VARCHAR(320),
    billing_address VARCHAR(512),
    billing_postal_code VARCHAR(64),
    billing_city VARCHAR(255),
    billing_country VARCHAR(2) NOT NULL DEFAULT 'SI',
    billing_tax_id VARCHAR(64),
    purchase_order_reference VARCHAR(255),
    features_json TEXT NOT NULL DEFAULT '[]',
    addons_json TEXT NOT NULL DEFAULT '[]',
    max_operating_units INTEGER NOT NULL DEFAULT 1,
    max_locations INTEGER NOT NULL DEFAULT 1,
    max_active_users INTEGER NOT NULL DEFAULT 1,
    max_consultants INTEGER NOT NULL DEFAULT 1,
    max_clients INTEGER NOT NULL DEFAULT 0,
    max_monthly_bookings INTEGER NOT NULL DEFAULT 0,
    included_sms_parts INTEGER NOT NULL DEFAULT 0,
    included_email_messages INTEGER NOT NULL DEFAULT 0,
    storage_limit_mb BIGINT NOT NULL DEFAULT 0,
    max_public_booking_pages INTEGER NOT NULL DEFAULT 1,
    analytics_retention_days INTEGER NOT NULL DEFAULT 365,
    allow_sms_overage BOOLEAN NOT NULL DEFAULT FALSE,
    allow_email_overage BOOLEAN NOT NULL DEFAULT TRUE,
    allow_booking_overage BOOLEAN NOT NULL DEFAULT TRUE,
    api_access BOOLEAN NOT NULL DEFAULT FALSE,
    CONSTRAINT ck_workspace_subscription_plan CHECK (plan_key IN ('TRIAL','BASIC','PROFESSIONAL','PREMIUM','CUSTOM')),
    CONSTRAINT ck_workspace_subscription_interval CHECK (billing_interval IN ('MONTHLY','YEARLY')),
    CONSTRAINT ck_workspace_subscription_status CHECK (status IN ('TRIAL','ACTIVE','PENDING_PAYMENT','GRACE','PAST_DUE','SUSPENDED','CANCELLED')),
    CONSTRAINT ck_workspace_subscription_country CHECK (char_length(billing_country) = 2),
    CONSTRAINT ck_workspace_subscription_nonnegative CHECK (
        max_operating_units >= 0 AND max_locations >= 0 AND max_active_users >= 0
        AND max_consultants >= 0 AND max_clients >= 0 AND max_monthly_bookings >= 0
        AND included_sms_parts >= 0 AND included_email_messages >= 0 AND storage_limit_mb >= 0
        AND max_public_booking_pages >= 0 AND analytics_retention_days >= 0
    )
);

CREATE INDEX IF NOT EXISTS ix_workspace_subscriptions_status_period
    ON workspace_subscriptions(status, current_period_end, workspace_id);
CREATE INDEX IF NOT EXISTS ix_workspace_subscriptions_billing_owner
    ON workspace_subscriptions(billing_owner_company_id);


CREATE TABLE IF NOT EXISTS workspace_usage_monthly (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    company_id BIGINT REFERENCES company(id) ON DELETE CASCADE,
    usage_month DATE NOT NULL,
    metric VARCHAR(40) NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 0,
    CONSTRAINT ck_workspace_usage_month_start CHECK (usage_month = date_trunc('month', usage_month)::date),
    CONSTRAINT ck_workspace_usage_quantity CHECK (quantity >= 0),
    CONSTRAINT uq_workspace_usage_monthly UNIQUE NULLS NOT DISTINCT (workspace_id, company_id, usage_month, metric)
);
CREATE INDEX IF NOT EXISTS ix_workspace_usage_monthly_lookup
    ON workspace_usage_monthly(workspace_id, usage_month, metric, company_id);

CREATE TABLE IF NOT EXISTS workspace_usage_events (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    company_id BIGINT REFERENCES company(id) ON DELETE CASCADE,
    usage_month DATE NOT NULL,
    metric VARCHAR(40) NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_id VARCHAR(128) NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT ck_workspace_usage_event_month_start CHECK (usage_month = date_trunc('month', usage_month)::date),
    CONSTRAINT ck_workspace_usage_event_quantity CHECK (quantity > 0),
    CONSTRAINT uq_workspace_usage_event_source UNIQUE (workspace_id, metric, source_type, source_id)
);
CREATE INDEX IF NOT EXISTS ix_workspace_usage_events_lookup
    ON workspace_usage_events(workspace_id, usage_month, metric, company_id);

CREATE TABLE IF NOT EXISTS workspace_subscription_audit_log (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    workspace_subscription_id BIGINT NOT NULL REFERENCES workspace_subscriptions(id) ON DELETE CASCADE,
    actor_login_account_id BIGINT REFERENCES login_accounts(id) ON DELETE SET NULL,
    actor_membership_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(80) NOT NULL,
    details TEXT
);
CREATE INDEX IF NOT EXISTS ix_workspace_subscription_audit
    ON workspace_subscription_audit_log(workspace_subscription_id, created_at DESC, id DESC);


CREATE OR REPLACE FUNCTION calendra_create_workspace_subscription()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO workspace_subscriptions (
        workspace_id, plan_key, billing_interval, status, features_json,
        max_operating_units, max_locations, max_active_users, max_consultants,
        max_public_booking_pages, created_at, updated_at
    ) VALUES (
        NEW.id, 'PROFESSIONAL', 'MONTHLY', 'ACTIVE',
        '["CORE","MULTI_UNIT","WORKSPACE_ANALYTICS","WORKSPACE_PUBLIC_BOOKING","CONFIGURATION_COPY"]',
        3, 10, 5, 5, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) ON CONFLICT (workspace_id) DO NOTHING;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_create_workspace_subscription ON workspaces;
CREATE TRIGGER trg_create_workspace_subscription
AFTER INSERT ON workspaces
FOR EACH ROW EXECUTE FUNCTION calendra_create_workspace_subscription();

-- Keep the subscription owner aligned with workspace membership without pre-production source-history rows.
CREATE OR REPLACE FUNCTION calendra_attach_company_to_workspace_subscription()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    old_subscription_id BIGINT;
    replacement_owner_id BIGINT;
BEGIN
    IF TG_OP = 'UPDATE' AND OLD.workspace_id IS DISTINCT FROM NEW.workspace_id AND OLD.workspace_id IS NOT NULL THEN
        SELECT id INTO old_subscription_id
          FROM workspace_subscriptions
         WHERE workspace_id = OLD.workspace_id;

        IF old_subscription_id IS NOT NULL
           AND EXISTS (
               SELECT 1 FROM workspace_subscriptions
                WHERE id = old_subscription_id
                  AND billing_owner_company_id = NEW.id
           ) THEN
            SELECT MIN(id) INTO replacement_owner_id
              FROM company
             WHERE workspace_id = OLD.workspace_id
               AND id <> NEW.id;

            UPDATE workspace_subscriptions
               SET billing_owner_company_id = replacement_owner_id,
                   updated_at = CURRENT_TIMESTAMP
             WHERE id = old_subscription_id;
        END IF;
    END IF;

    IF NEW.workspace_id IS NULL THEN
        RETURN NEW;
    END IF;

    INSERT INTO workspace_subscriptions (
        workspace_id, plan_key, billing_interval, status, features_json,
        max_operating_units, max_locations, max_active_users, max_consultants,
        max_public_booking_pages, created_at, updated_at
    ) VALUES (
        NEW.workspace_id, 'PROFESSIONAL', 'MONTHLY', 'ACTIVE',
        '["CORE","MULTI_UNIT","WORKSPACE_ANALYTICS","WORKSPACE_PUBLIC_BOOKING","CONFIGURATION_COPY"]',
        3, 10, 5, 5, 3, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
    ) ON CONFLICT (workspace_id) DO NOTHING;

    UPDATE workspace_subscriptions
       SET billing_owner_company_id = COALESCE(billing_owner_company_id, NEW.id),
           updated_at = CURRENT_TIMESTAMP
     WHERE workspace_id = NEW.workspace_id;

    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_attach_company_to_workspace_subscription ON company;
CREATE TRIGGER trg_attach_company_to_workspace_subscription
AFTER INSERT OR UPDATE OF workspace_id ON company
FOR EACH ROW EXECUTE FUNCTION calendra_attach_company_to_workspace_subscription();

CREATE OR REPLACE FUNCTION calendra_validate_workspace_subscription_payer()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE payer_workspace BIGINT; owner_workspace BIGINT;
BEGIN
    IF NEW.billing_owner_company_id IS NOT NULL THEN
        SELECT workspace_id INTO owner_workspace FROM company WHERE id = NEW.billing_owner_company_id;
        IF owner_workspace IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Subscription billing-owner company does not exist';
        END IF;
        IF owner_workspace <> NEW.workspace_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Subscription billing owner must belong to the same workspace';
        END IF;
    END IF;

    IF NEW.payer_legal_entity_id IS NOT NULL THEN
        SELECT workspace_id INTO payer_workspace FROM legal_entities WHERE id = NEW.payer_legal_entity_id;
        IF payer_workspace IS NULL THEN
            RAISE EXCEPTION USING ERRCODE = '23503', MESSAGE = 'Subscription payer legal entity does not exist';
        END IF;
        IF payer_workspace <> NEW.workspace_id THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Subscription payer must belong to the same workspace';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_validate_workspace_subscription_payer ON workspace_subscriptions;
CREATE TRIGGER trg_validate_workspace_subscription_payer
BEFORE INSERT OR UPDATE OF workspace_id, billing_owner_company_id, payer_legal_entity_id ON workspace_subscriptions
FOR EACH ROW EXECUTE FUNCTION calendra_validate_workspace_subscription_payer();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_unit_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed_units INTEGER; current_units INTEGER;
BEGIN
    SELECT max_operating_units INTO allowed_units FROM workspace_subscriptions WHERE workspace_id = NEW.workspace_id;
    IF allowed_units IS NULL OR allowed_units = 0 THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO current_units FROM company WHERE workspace_id = NEW.workspace_id AND (TG_OP = 'INSERT' OR id <> NEW.id);
    IF current_units + 1 > allowed_units THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace operating-unit limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_workspace_unit_limit ON company;
CREATE TRIGGER trg_enforce_workspace_unit_limit
BEFORE INSERT OR UPDATE OF workspace_id ON company
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_unit_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_location_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_locations INTEGER; current_locations INTEGER;
BEGIN
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_locations INTO allowed_locations FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_locations IS NULL OR allowed_locations = 0 THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO current_locations
      FROM locations l JOIN company c ON c.id = l.company_id
     WHERE c.workspace_id = target_workspace AND (TG_OP = 'INSERT' OR l.id <> NEW.id);
    IF current_locations + 1 > allowed_locations THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace location limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_workspace_location_limit ON locations;
CREATE TRIGGER trg_enforce_workspace_location_limit
BEFORE INSERT OR UPDATE OF company_id ON locations
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_location_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_user_limits()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; max_users INTEGER; max_consultants_limit INTEGER; current_users INTEGER; current_consultants INTEGER;
BEGIN
    IF NOT NEW.active THEN RETURN NEW; END IF;
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_active_users, max_consultants INTO max_users, max_consultants_limit
      FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF max_users IS NOT NULL AND max_users > 0 THEN
        SELECT COUNT(DISTINCT u.login_account_id) INTO current_users
          FROM users u JOIN company c ON c.id = u.company_id
         WHERE c.workspace_id = target_workspace AND u.active AND (TG_OP = 'INSERT' OR u.id <> NEW.id);
        IF NOT EXISTS (
            SELECT 1 FROM users u JOIN company c ON c.id = u.company_id
             WHERE c.workspace_id = target_workspace AND u.active AND u.login_account_id = NEW.login_account_id
               AND (TG_OP = 'INSERT' OR u.id <> NEW.id)
        ) AND current_users + 1 > max_users THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace active-user limit reached';
        END IF;
    END IF;
    IF NEW.consultant AND max_consultants_limit IS NOT NULL AND max_consultants_limit > 0 THEN
        SELECT COUNT(DISTINCT u.login_account_id) INTO current_consultants
          FROM users u JOIN company c ON c.id = u.company_id
         WHERE c.workspace_id = target_workspace AND u.active AND u.consultant AND (TG_OP = 'INSERT' OR u.id <> NEW.id);
        IF NOT EXISTS (
            SELECT 1 FROM users u JOIN company c ON c.id = u.company_id
             WHERE c.workspace_id = target_workspace AND u.active AND u.consultant AND u.login_account_id = NEW.login_account_id
               AND (TG_OP = 'INSERT' OR u.id <> NEW.id)
        ) AND current_consultants + 1 > max_consultants_limit THEN
            RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace consultant limit reached';
        END IF;
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_enforce_workspace_user_limits ON users;
CREATE TRIGGER trg_enforce_workspace_user_limits
BEFORE INSERT OR UPDATE OF company_id, login_account_id, active, consultant ON users
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_user_limits();


-- Optional hard limits. A zero limit means unlimited.
CREATE OR REPLACE FUNCTION calendra_enforce_workspace_client_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_clients INTEGER; current_clients BIGINT; identity_exists BOOLEAN;
BEGIN
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_clients INTO allowed_clients FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_clients IS NULL OR allowed_clients = 0 THEN RETURN NEW; END IF;

    SELECT COUNT(DISTINCT COALESCE(cl.workspace_client_id, cl.id))
      INTO current_clients
      FROM clients cl
      JOIN company c ON c.id = cl.company_id
     WHERE c.workspace_id = target_workspace
       AND (TG_OP = 'INSERT' OR cl.id <> NEW.id);

    SELECT EXISTS (
        SELECT 1
          FROM clients cl
          JOIN company c ON c.id = cl.company_id
         WHERE c.workspace_id = target_workspace
           AND COALESCE(cl.workspace_client_id, cl.id) = COALESCE(NEW.workspace_client_id, NEW.id)
           AND (TG_OP = 'INSERT' OR cl.id <> NEW.id)
    ) INTO identity_exists;

    IF NOT identity_exists AND current_clients + 1 > allowed_clients THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace client limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_clients_workspace_subscription_limit ON clients;
CREATE TRIGGER trg_clients_workspace_subscription_limit
BEFORE INSERT OR UPDATE OF company_id, workspace_client_id ON clients
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_client_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_booking_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_bookings INTEGER; overage_allowed BOOLEAN; current_bookings BIGINT;
BEGIN
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_monthly_bookings, allow_booking_overage
      INTO allowed_bookings, overage_allowed
      FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_bookings IS NULL OR allowed_bookings = 0 OR COALESCE(overage_allowed, TRUE) THEN RETURN NEW; END IF;

    SELECT COUNT(*) INTO current_bookings
      FROM session_booking sb
      JOIN company c ON c.id = sb.company_id
     WHERE c.workspace_id = target_workspace
       AND sb.start_time >= date_trunc('month', NEW.start_time)
       AND sb.start_time < date_trunc('month', NEW.start_time) + interval '1 month'
       AND (TG_OP = 'INSERT' OR sb.id <> NEW.id);
    IF current_bookings + 1 > allowed_bookings THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace monthly booking limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_session_booking_workspace_subscription_limit ON session_booking;
CREATE TRIGGER trg_session_booking_workspace_subscription_limit
BEFORE INSERT OR UPDATE OF company_id, start_time ON session_booking
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_booking_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_storage_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_bytes NUMERIC; current_bytes NUMERIC;
BEGIN
    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.owner_company_id;
    SELECT storage_limit_mb::numeric * 1048576 INTO allowed_bytes
      FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_bytes IS NULL OR allowed_bytes = 0 THEN RETURN NEW; END IF;

    SELECT COALESCE((
        SELECT SUM(f.size_bytes) FROM client_files f JOIN company c ON c.id = f.owner_company_id
         WHERE c.workspace_id = target_workspace
           AND (TG_TABLE_NAME <> 'client_files' OR TG_OP = 'INSERT' OR f.id <> NEW.id)
    ), 0) + COALESCE((
        SELECT SUM(f.size_bytes) FROM company_files f JOIN company c ON c.id = f.owner_company_id
         WHERE c.workspace_id = target_workspace
           AND (TG_TABLE_NAME <> 'company_files' OR TG_OP = 'INSERT' OR f.id <> NEW.id)
    ), 0) INTO current_bytes;

    IF current_bytes + GREATEST(COALESCE(NEW.size_bytes, 0), 0) > allowed_bytes THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace storage limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_client_files_workspace_subscription_limit ON client_files;
CREATE TRIGGER trg_client_files_workspace_subscription_limit
BEFORE INSERT OR UPDATE OF owner_company_id, size_bytes ON client_files
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_storage_limit();
DROP TRIGGER IF EXISTS trg_company_files_workspace_subscription_limit ON company_files;
CREATE TRIGGER trg_company_files_workspace_subscription_limit
BEFORE INSERT OR UPDATE OF owner_company_id, size_bytes ON company_files
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_storage_limit();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_public_page_limit_for_company()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed_pages INTEGER; current_pages BIGINT;
BEGIN
    IF NOT NEW.workspace_public_booking_enabled THEN RETURN NEW; END IF;
    SELECT max_public_booking_pages INTO allowed_pages FROM workspace_subscriptions WHERE workspace_id = NEW.workspace_id;
    IF allowed_pages IS NULL OR allowed_pages = 0 THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO current_pages
      FROM company c
     WHERE c.workspace_id = NEW.workspace_id
       AND c.workspace_public_booking_enabled
       AND (TG_OP = 'INSERT' OR c.id <> NEW.id);
    current_pages := current_pages + COALESCE((SELECT COUNT(*) FROM workspace_public_booking_settings s WHERE s.workspace_id = NEW.workspace_id AND s.enabled), 0);
    IF current_pages + 1 > allowed_pages THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace public-booking page limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_company_workspace_public_page_limit ON company;
CREATE TRIGGER trg_company_workspace_public_page_limit
BEFORE INSERT OR UPDATE OF workspace_id, workspace_public_booking_enabled ON company
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_public_page_limit_for_company();

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_public_page_limit_for_workspace()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE allowed_pages INTEGER; current_pages BIGINT;
BEGIN
    IF NOT NEW.enabled THEN RETURN NEW; END IF;
    SELECT max_public_booking_pages INTO allowed_pages FROM workspace_subscriptions WHERE workspace_id = NEW.workspace_id;
    IF allowed_pages IS NULL OR allowed_pages = 0 THEN RETURN NEW; END IF;
    SELECT COUNT(*) INTO current_pages FROM company c WHERE c.workspace_id = NEW.workspace_id AND c.workspace_public_booking_enabled;
    current_pages := current_pages + COALESCE((
        SELECT COUNT(*) FROM workspace_public_booking_settings s
         WHERE s.workspace_id = NEW.workspace_id AND s.enabled AND (TG_OP = 'INSERT' OR s.id <> NEW.id)
    ), 0);
    IF current_pages + 1 > allowed_pages THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace public-booking page limit reached';
    END IF;
    RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_workspace_public_booking_subscription_limit ON workspace_public_booking_settings;
CREATE TRIGGER trg_workspace_public_booking_subscription_limit
BEFORE INSERT OR UPDATE OF workspace_id, enabled ON workspace_public_booking_settings
FOR EACH ROW EXECUTE FUNCTION calendra_enforce_workspace_public_page_limit_for_workspace();



-- ============================================================================
-- Client Location Visibility
-- ============================================================================

-- Persist the physical location on open bills so draft/unissued billing can be filtered reliably.
ALTER TABLE open_bills ADD COLUMN IF NOT EXISTS location_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_open_bills_location') THEN
        ALTER TABLE open_bills
            ADD CONSTRAINT fk_open_bills_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_open_bills_company_location
    ON open_bills(company_id, location_id, id DESC);

CREATE OR REPLACE FUNCTION calendra_validate_open_bill_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        SELECT id INTO NEW.location_id
          FROM locations
         WHERE company_id = NEW.company_id
           AND default_location = TRUE
         ORDER BY id
         LIMIT 1;
    END IF;

    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Open bill location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_open_bill_validate_location ON open_bills;
CREATE TRIGGER trg_open_bill_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON open_bills
FOR EACH ROW EXECUTE FUNCTION calendra_validate_open_bill_location();

CREATE TABLE client_assigned_locations (
    client_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    PRIMARY KEY (client_id, location_id),
    CONSTRAINT fk_client_assigned_locations_client FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_assigned_locations_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);
CREATE INDEX idx_client_assigned_locations_location ON client_assigned_locations(location_id);

CREATE TABLE client_company_assigned_locations (
    client_company_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    PRIMARY KEY (client_company_id, location_id),
    CONSTRAINT fk_client_company_assigned_locations_company FOREIGN KEY (client_company_id) REFERENCES client_companies(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_company_assigned_locations_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);
CREATE INDEX idx_client_company_assigned_locations_location ON client_company_assigned_locations(location_id);

CREATE TABLE client_group_assigned_locations (
    group_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    PRIMARY KEY (group_id, location_id),
    CONSTRAINT fk_client_group_assigned_locations_group FOREIGN KEY (group_id) REFERENCES client_groups(id) ON DELETE CASCADE,
    CONSTRAINT fk_client_group_assigned_locations_location FOREIGN KEY (location_id) REFERENCES locations(id) ON DELETE CASCADE
);
CREATE INDEX idx_client_group_assigned_locations_location ON client_group_assigned_locations(location_id);

-- Guard tenant isolation even for imports and direct SQL writes.
CREATE OR REPLACE FUNCTION calendra_validate_client_assigned_location()
RETURNS trigger AS $$
DECLARE client_company_id BIGINT;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id INTO client_company_id FROM clients WHERE id = NEW.client_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF client_company_id IS NULL OR location_company_id IS NULL OR client_company_id <> location_company_id THEN
        RAISE EXCEPTION 'Client % and location % do not belong to the same company', NEW.client_id, NEW.location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_assigned_location_validate
BEFORE INSERT OR UPDATE ON client_assigned_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_client_assigned_location();

CREATE OR REPLACE FUNCTION calendra_validate_client_company_assigned_location()
RETURNS trigger AS $$
DECLARE owner_company_id BIGINT;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT cc.owner_company_id INTO owner_company_id FROM client_companies cc WHERE cc.id = NEW.client_company_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF owner_company_id IS NULL OR location_company_id IS NULL OR owner_company_id <> location_company_id THEN
        RAISE EXCEPTION 'Client company % and location % do not belong to the same company', NEW.client_company_id, NEW.location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_company_assigned_location_validate
BEFORE INSERT OR UPDATE ON client_company_assigned_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_client_company_assigned_location();

CREATE OR REPLACE FUNCTION calendra_validate_client_group_assigned_location()
RETURNS trigger AS $$
DECLARE group_company_id BIGINT;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id INTO group_company_id FROM client_groups WHERE id = NEW.group_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF group_company_id IS NULL OR location_company_id IS NULL OR group_company_id <> location_company_id THEN
        RAISE EXCEPTION 'Client group % and location % do not belong to the same company', NEW.group_id, NEW.location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_group_assigned_location_validate
BEFORE INSERT OR UPDATE ON client_group_assigned_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_client_group_assigned_location();


-- ============================================================================
-- Bill Item Original Gross Price
-- ============================================================================

ALTER TABLE bill_item
    ADD COLUMN IF NOT EXISTS original_gross_price NUMERIC(12, 2);


-- ============================================================================
-- Invoice Device Default And Location Prefix
-- ============================================================================

-- Normalize the electronic device identifier at the database boundary so raw SQL
-- writers receive the same default as application-managed writes.
CREATE OR REPLACE FUNCTION calendra_default_invoice_series_device()
RETURNS trigger AS $$
BEGIN
    IF NEW.electronic_device_id IS NULL OR BTRIM(NEW.electronic_device_id) = '' THEN
        NEW.electronic_device_id := '1';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_invoice_series_default_device ON invoice_series;
CREATE TRIGGER trg_invoice_series_default_device
BEFORE INSERT OR UPDATE ON invoice_series
FOR EACH ROW EXECUTE FUNCTION calendra_default_invoice_series_device();

ALTER TABLE invoice_series
    ALTER COLUMN electronic_device_id SET DEFAULT '1';

ALTER TABLE invoice_series
    ALTER COLUMN electronic_device_id SET NOT NULL;



-- ============================================================================
-- Location Address And Invoice Counters
-- ============================================================================

-- Each physical location owns its address/timezone and its default invoice counter.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'SI';
ALTER TABLE locations ADD COLUMN IF NOT EXISTS default_invoice_series_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_location_default_invoice_series') THEN
        ALTER TABLE locations
            ADD CONSTRAINT fk_location_default_invoice_series
            FOREIGN KEY (default_invoice_series_id) REFERENCES invoice_series(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_locations_default_invoice_series
    ON locations(default_invoice_series_id);


-- ============================================================================
-- Legal Entity Fiscal Premise Fields
-- ============================================================================

ALTER TABLE legal_entities
    ADD COLUMN IF NOT EXISTS fiscal_cadastral_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fiscal_building_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fiscal_building_section_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fiscal_house_number VARCHAR(64),
    ADD COLUMN IF NOT EXISTS fiscal_house_number_additional VARCHAR(64);


-- ============================================================================
-- Session Booking Update Trigger Guards
-- ============================================================================

-- Unrelated SessionBooking updates (for example cancelling/removing one group participant)
-- must not be treated as a new/moved booking by subscription/location integrity triggers.
-- Hibernate can generate full-row UPDATE statements, so PostgreSQL UPDATE OF triggers
-- could fire even when company/start/location/space values were unchanged.

CREATE OR REPLACE FUNCTION calendra_validate_booking_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
       AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
       AND NEW.space_id IS NOT DISTINCT FROM OLD.space_id THEN
        RETURN NEW;
    END IF;

    IF NEW.space_id IS NOT NULL THEN
        SELECT location_id INTO space_location_id FROM space
         WHERE id = NEW.space_id AND company_id = NEW.company_id;
        IF space_location_id IS NULL THEN
            RAISE EXCEPTION 'Booking space % does not belong to company %', NEW.space_id, NEW.company_id
                USING ERRCODE = '23514';
        END IF;
        IF NEW.location_id IS NULL THEN
            NEW.location_id := space_location_id;
        ELSIF NEW.location_id <> space_location_id THEN
            RAISE EXCEPTION 'Booking space % belongs to location %, not %', NEW.space_id, space_location_id, NEW.location_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.location_id IS NULL THEN
        SELECT id INTO NEW.location_id FROM locations
         WHERE company_id = NEW.company_id AND default_location = TRUE
         ORDER BY id LIMIT 1;
    END IF;

    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Booking location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_enforce_workspace_booking_limit()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE target_workspace BIGINT; allowed_bookings INTEGER; overage_allowed BOOLEAN; current_bookings BIGINT;
BEGIN
    -- UPDATE OF company_id/start_time fires when those columns are present in the SQL SET list,
    -- even if their values did not actually change. Do not re-apply the monthly creation limit
    -- to an attendee/status/billing-only update.
    IF TG_OP = 'UPDATE'
       AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
       AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time THEN
        RETURN NEW;
    END IF;

    SELECT workspace_id INTO target_workspace FROM company WHERE id = NEW.company_id;
    SELECT max_monthly_bookings, allow_booking_overage
      INTO allowed_bookings, overage_allowed
      FROM workspace_subscriptions WHERE workspace_id = target_workspace;
    IF allowed_bookings IS NULL OR allowed_bookings = 0 OR COALESCE(overage_allowed, TRUE) THEN RETURN NEW; END IF;

    SELECT COUNT(*) INTO current_bookings
      FROM session_booking sb
      JOIN company c ON c.id = sb.company_id
     WHERE c.workspace_id = target_workspace
       AND sb.start_time >= date_trunc('month', NEW.start_time)
       AND sb.start_time < date_trunc('month', NEW.start_time) + interval '1 month'
       AND (TG_OP = 'INSERT' OR sb.id <> NEW.id);
    IF current_bookings + 1 > allowed_bookings THEN
        RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'Workspace monthly booking limit reached';
    END IF;
    RETURN NEW;
END $$;


-- ============================================================================
-- Entitlement Open Bill Settlement Audit
-- ============================================================================

-- Preserve an internal audit trail when a prepaid membership/pass settles an open bill
-- without issuing a second invoice. The open bill itself is deleted after settlement, so
-- source_open_bill_id intentionally has no foreign key.
ALTER TABLE guest_entitlement_usages
    ADD COLUMN IF NOT EXISTS source_open_bill_id BIGINT;

ALTER TABLE guest_entitlement_usages
    ADD COLUMN IF NOT EXISTS covered_gross NUMERIC(12,2);

CREATE INDEX IF NOT EXISTS idx_guest_entitlement_usage_open_bill
    ON guest_entitlement_usages (source_open_bill_id)
    WHERE source_open_bill_id IS NOT NULL;


-- ============================================================================
-- Activity Logs
-- ============================================================================

CREATE TABLE activity_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    workspace_id BIGINT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    location_id BIGINT NULL,
    space_id BIGINT NULL,
    actor_type VARCHAR(40) NOT NULL,
    actor_login_account_id BIGINT NULL,
    actor_user_id BIGINT NULL,
    actor_name_snapshot VARCHAR(240) NOT NULL,
    module VARCHAR(40) NOT NULL,
    action_code VARCHAR(80) NOT NULL,
    entity_type VARCHAR(80) NOT NULL,
    entity_id BIGINT NULL,
    entity_label VARCHAR(320) NULL,
    secondary_entity_type VARCHAR(80) NULL,
    secondary_entity_id BIGINT NULL,
    secondary_entity_label VARCHAR(320) NULL,
    summary VARCHAR(1000) NOT NULL,
    details_json TEXT NULL,
    source VARCHAR(60) NOT NULL,
    occurred_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_activity_logs_workspace_time ON activity_logs (workspace_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_company_time ON activity_logs (company_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_actor_time ON activity_logs (actor_user_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_entity_time ON activity_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_location_time ON activity_logs (location_id, occurred_at DESC);
CREATE INDEX idx_activity_logs_module_time ON activity_logs (company_id, module, occurred_at DESC);
CREATE INDEX idx_activity_logs_action_time ON activity_logs (company_id, action_code, occurred_at DESC);


-- ============================================================================
-- Voucher Redemption Modes
-- ============================================================================

ALTER TABLE guest_products
    ADD COLUMN IF NOT EXISTS voucher_redemption_mode VARCHAR(16),
    ADD COLUMN IF NOT EXISTS voucher_service_scope VARCHAR(32),
    ADD COLUMN IF NOT EXISTS voucher_face_value_gross NUMERIC(12, 2);

CREATE TABLE IF NOT EXISTS guest_product_voucher_session_types (
    product_id BIGINT NOT NULL,
    session_type_id BIGINT NOT NULL,
    PRIMARY KEY (product_id, session_type_id),
    CONSTRAINT fk_guest_product_voucher_session_types_product
        FOREIGN KEY (product_id) REFERENCES guest_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_guest_product_voucher_session_types_session_type
        FOREIGN KEY (session_type_id) REFERENCES session_type(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guest_product_voucher_session_types_session_type
    ON guest_product_voucher_session_types(session_type_id);


-- ============================================================================
-- Session Booking Max Participants Override
-- ============================================================================

ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS max_participants_override INTEGER;


-- ============================================================================
-- Location Public Presentation
-- ============================================================================

-- Location-level public identity foundation.
-- Public-facing presentation now belongs to a physical location rather than the legal company.

ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_name VARCHAR(255);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_address VARCHAR(512);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_description VARCHAR(500);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_logo_s3_key VARCHAR(1024);
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_directory_enabled BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS guest_app_discoverable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS website_presentation_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS google_place_id VARCHAR(255);

CREATE INDEX IF NOT EXISTS idx_locations_public_directory
    ON locations(public_directory_enabled, active, company_id, id)
    WHERE public_directory_enabled = TRUE;
CREATE INDEX IF NOT EXISTS idx_locations_guest_app_discoverable
    ON locations(guest_app_discoverable, active, company_id, id)
    WHERE guest_app_discoverable = TRUE;


-- Keep raw-SQL provisioning safe.  New columns use their database defaults; this
-- replacement simply keeps the function in sync with the current locations table.
CREATE OR REPLACE FUNCTION calendra_ensure_company_default_location()
RETURNS trigger AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM locations WHERE company_id = NEW.id) THEN
        INSERT INTO locations (
            created_at, updated_at, company_id, name, timezone,
            public_booking_enabled, default_location, active,
            public_directory_enabled, guest_app_discoverable, website_presentation_enabled
        ) VALUES (
            COALESCE(NEW.created_at, now()), COALESCE(NEW.updated_at, now()), NEW.id,
            COALESCE(NULLIF(trim(NEW.name), ''), 'Location'), 'Europe/Ljubljana',
            TRUE, TRUE, TRUE, FALSE, FALSE, TRUE
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- Billing Summary Indexes
-- ============================================================================

-- Phase 2 billing performance: support lightweight tab counters and advance-balance aggregation.
CREATE INDEX IF NOT EXISTS idx_bills_company_type_status_location
    ON bills (company_id, bill_type, payment_status, location_id, id);

CREATE INDEX IF NOT EXISTS idx_advance_allocations_company_advance
    ON advance_allocations (company_id, advance_bill_id);

CREATE INDEX IF NOT EXISTS idx_bill_item_source_advance
    ON bill_item (source_advance_bill_id)
    WHERE source_advance_bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_open_bill_payments_source_advance
    ON open_bill_payments (source_advance_bill_id)
    WHERE source_advance_bill_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bill_payments_source_advance
    ON bill_payments (source_advance_bill_id)
    WHERE source_advance_bill_id IS NOT NULL;


-- ============================================================================
-- Billing List Pagination Indexes
-- ============================================================================

-- Phase 2.2 billing performance: support server-paged billing lists.
-- General indexes cover company/date and source-advance lookups; these
-- composites target the location-aware history and open-payment access paths.
CREATE INDEX IF NOT EXISTS idx_bills_company_location_issue_date_id
    ON bills (company_id, location_id, issue_date DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_bills_company_open_payment_location_issue_date_id
    ON bills (company_id, location_id, issue_date DESC, id DESC)
    WHERE payment_status <> 'paid' AND payment_status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_guest_entitlements_company_created_id
    ON guest_entitlements (company_id, created_at DESC, id DESC);


-- ============================================================================
-- Client Directory Paging Indexes
-- ============================================================================

-- Client directory paging/search/sorting support.
-- Keep these indexes narrow and aligned with the default active + name ordering used by the UI.
CREATE INDEX IF NOT EXISTS idx_clients_company_active_name_page
    ON clients (company_id, active, lower(last_name), lower(first_name), id);

CREATE INDEX IF NOT EXISTS idx_client_companies_owner_active_name_page
    ON client_companies (owner_company_id, active, lower(name), id);

CREATE INDEX IF NOT EXISTS idx_client_groups_company_active_name_page
    ON client_groups (company_id, active, lower(name), id);-- ============================================================================
-- Operational Location Ownership Foundation
-- ============================================================================

ALTER TABLE open_bills ALTER COLUMN location_id SET NOT NULL;
ALTER TABLE waitlist_requests ALTER COLUMN location_id SET NOT NULL;

-- Persist the branch directly on an offer. It is immutable operational context and should
-- not have to be reconstructed through waitlist_request joins later.
ALTER TABLE waitlist_offers ADD COLUMN IF NOT EXISTS location_id BIGINT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waitlist_offer_location') THEN
        ALTER TABLE waitlist_offers
            ADD CONSTRAINT fk_waitlist_offer_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE waitlist_offers ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waitlist_offer_location_status_expiry
    ON waitlist_offers(location_id, status, expires_at);

-- A waitlist reservation hold belongs to exactly the same branch as its offer.
ALTER TABLE waitlist_booking_holds ADD COLUMN IF NOT EXISTS location_id BIGINT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_waitlist_hold_location') THEN
        ALTER TABLE waitlist_booking_holds
            ADD CONSTRAINT fk_waitlist_hold_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE waitlist_booking_holds ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_waitlist_hold_location_active_slot
    ON waitlist_booking_holds(location_id, status, slot_start, slot_end);

-- Public booking holds always carry the selected branch.
ALTER TABLE booking_slot_holds ADD COLUMN IF NOT EXISTS location_id BIGINT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_booking_slot_hold_location') THEN
        ALTER TABLE booking_slot_holds
            ADD CONSTRAINT fk_booking_slot_hold_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE booking_slot_holds ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_booking_slot_holds_location_window
    ON booking_slot_holds(location_id, expires_at, slot_start, busy_end);

-- Guest orders already store the selected branch in metadata for booking orders. Normalize it
-- into a relation now. It remains nullable until Phase 5.5C makes non-booking purchases location-scoped.
ALTER TABLE guest_orders ADD COLUMN IF NOT EXISTS location_id BIGINT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_guest_order_location') THEN
        ALTER TABLE guest_orders
            ADD CONSTRAINT fk_guest_order_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_guest_orders_company_location_created
    ON guest_orders(company_id, location_id, created_at DESC);

-- Cross-company/location guardrails. These mirror existing booking/open-bill validation and
-- prevent a caller from persisting a location owned by another operating unit.
CREATE OR REPLACE FUNCTION calendra_validate_booking_slot_hold_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
DECLARE group_location_id BIGINT;
BEGIN
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Booking hold location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NEW.group_session_id IS NOT NULL THEN
        SELECT location_id INTO group_location_id FROM session_booking
         WHERE id = NEW.group_session_id AND company_id = NEW.company_id;
        IF group_location_id IS NULL OR group_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Booking hold group session % belongs to another location', NEW.group_session_id
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_booking_slot_hold_validate_location ON booking_slot_holds;
CREATE TRIGGER trg_booking_slot_hold_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, group_session_id ON booking_slot_holds
FOR EACH ROW EXECUTE FUNCTION calendra_validate_booking_slot_hold_location();

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_offer_location()
RETURNS trigger AS $$
DECLARE request_company_id BIGINT;
DECLARE request_location_id BIGINT;
DECLARE room_location_id BIGINT;
DECLARE session_location_id BIGINT;
BEGIN
    SELECT company_id, location_id INTO request_company_id, request_location_id
      FROM waitlist_requests WHERE id = NEW.waitlist_request_id;
    IF request_company_id IS NULL OR request_company_id <> NEW.company_id OR request_location_id <> NEW.location_id THEN
        RAISE EXCEPTION 'Waitlist offer location must match its request location'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.room_id IS NOT NULL THEN
        SELECT location_id INTO room_location_id FROM space WHERE id = NEW.room_id AND company_id = NEW.company_id;
        IF room_location_id IS NULL OR room_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Waitlist offer room belongs to another location' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.session_id IS NOT NULL THEN
        SELECT location_id INTO session_location_id FROM session_booking WHERE id = NEW.session_id AND company_id = NEW.company_id;
        IF session_location_id IS NULL OR session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Waitlist offer session belongs to another location' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_waitlist_offer_validate_location ON waitlist_offers;
CREATE TRIGGER trg_waitlist_offer_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, waitlist_request_id, room_id, session_id ON waitlist_offers
FOR EACH ROW EXECUTE FUNCTION calendra_validate_waitlist_offer_location();

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_hold_location()
RETURNS trigger AS $$
DECLARE offer_company_id BIGINT;
DECLARE offer_location_id BIGINT;
DECLARE room_location_id BIGINT;
DECLARE session_location_id BIGINT;
BEGIN
    SELECT company_id, location_id INTO offer_company_id, offer_location_id
      FROM waitlist_offers WHERE id = NEW.offer_id;
    IF offer_company_id IS NULL OR offer_company_id <> NEW.company_id OR offer_location_id <> NEW.location_id THEN
        RAISE EXCEPTION 'Waitlist hold location must match its offer location'
            USING ERRCODE = '23514';
    END IF;
    IF NEW.room_id IS NOT NULL THEN
        SELECT location_id INTO room_location_id FROM space WHERE id = NEW.room_id AND company_id = NEW.company_id;
        IF room_location_id IS NULL OR room_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Waitlist hold room belongs to another location' USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.session_id IS NOT NULL THEN
        SELECT location_id INTO session_location_id FROM session_booking WHERE id = NEW.session_id AND company_id = NEW.company_id;
        IF session_location_id IS NULL OR session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Waitlist hold session belongs to another location' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_waitlist_hold_validate_location ON waitlist_booking_holds;
CREATE TRIGGER trg_waitlist_hold_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, offer_id, room_id, session_id ON waitlist_booking_holds
FOR EACH ROW EXECUTE FUNCTION calendra_validate_waitlist_hold_location();

CREATE OR REPLACE FUNCTION calendra_validate_guest_order_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN RETURN NEW; END IF;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Guest order location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_guest_order_validate_location ON guest_orders;
CREATE TRIGGER trg_guest_order_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON guest_orders
FOR EACH ROW EXECUTE FUNCTION calendra_validate_guest_order_location();

-- Remove the remaining database-level "default branch" escape hatch for concrete operational
-- rows. Omitted location is accepted only for a company with exactly one active branch;
-- multi-location raw writers must provide location_id explicitly.
CREATE OR REPLACE FUNCTION calendra_single_active_location_id(p_company_id BIGINT)
RETURNS BIGINT AS $$
DECLARE resolved_id BIGINT;
DECLARE active_count INTEGER;
BEGIN
    SELECT COUNT(*), MIN(id) INTO active_count, resolved_id
      FROM locations
     WHERE company_id = p_company_id
       AND active = TRUE;
    IF active_count = 0 THEN
        RAISE EXCEPTION 'Company % has no active location', p_company_id USING ERRCODE = '23514';
    END IF;
    IF active_count > 1 THEN
        RAISE EXCEPTION 'Location selection is required for company %', p_company_id USING ERRCODE = '23514';
    END IF;
    RETURN resolved_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_space_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        NEW.location_id := calendra_single_active_location_id(NEW.company_id);
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Space location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_booking_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
DECLARE space_location_id BIGINT;
BEGIN
    -- Preserve the V38 guard: attendee/status/billing-only updates must not be interpreted as moves.
    IF TG_OP = 'UPDATE'
       AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
       AND NEW.location_id IS NOT DISTINCT FROM OLD.location_id
       AND NEW.space_id IS NOT DISTINCT FROM OLD.space_id THEN
        RETURN NEW;
    END IF;

    IF NEW.space_id IS NOT NULL THEN
        SELECT location_id INTO space_location_id FROM space
         WHERE id = NEW.space_id AND company_id = NEW.company_id;
        IF space_location_id IS NULL THEN
            RAISE EXCEPTION 'Booking space % does not belong to company %', NEW.space_id, NEW.company_id
                USING ERRCODE = '23514';
        END IF;
        IF NEW.location_id IS NULL THEN
            NEW.location_id := space_location_id;
        ELSIF NEW.location_id <> space_location_id THEN
            RAISE EXCEPTION 'Booking space % belongs to location %, not %', NEW.space_id, space_location_id, NEW.location_id
                USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.location_id IS NULL THEN
        NEW.location_id := calendra_single_active_location_id(NEW.company_id);
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Booking location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_open_bill_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        NEW.location_id := calendra_single_active_location_id(NEW.company_id);
    END IF;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Open bill location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION calendra_validate_waitlist_location()
RETURNS trigger AS $$
DECLARE expected_company_id BIGINT;
BEGIN
    IF NEW.location_id IS NULL THEN
        NEW.location_id := calendra_single_active_location_id(NEW.company_id);
    END IF;
    SELECT company_id INTO expected_company_id FROM locations WHERE id = NEW.location_id;
    IF expected_company_id IS NULL OR expected_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Waitlist location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- Consultant Location Availability
-- ============================================================================

-- Phase 5.5B: location-own recurring availability and make consultant availability scope explicit.

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS working_hours_by_location_json TEXT;

CREATE TABLE IF NOT EXISTS user_locations (
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (user_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_user_locations_location_user
    ON user_locations(location_id, user_id);

ALTER TABLE bookable_slot ADD COLUMN IF NOT EXISTS location_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_bookable_slot_location') THEN
        ALTER TABLE bookable_slot
            ADD CONSTRAINT fk_bookable_slot_location FOREIGN KEY (location_id) REFERENCES locations(id);
    END IF;
END $$;
ALTER TABLE bookable_slot ALTER COLUMN location_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_bookable_slot_location_day_consultant_dates
    ON bookable_slot(location_id, day_of_week, consultant_id, start_date, end_date, start_time, end_time);
CREATE INDEX IF NOT EXISTS idx_bookable_slot_consultant_location_day_time
    ON bookable_slot(consultant_id, location_id, day_of_week, start_time, end_time);

-- Selected user/location assignments may only connect rows belonging to the same company.
CREATE OR REPLACE FUNCTION calendra_validate_user_location_scope()
RETURNS trigger AS $$
DECLARE user_company_id BIGINT;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id INTO user_company_id FROM users WHERE id = NEW.user_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF user_company_id IS NULL OR location_company_id IS NULL OR user_company_id <> location_company_id THEN
        RAISE EXCEPTION 'User % and location % must belong to the same company', NEW.user_id, NEW.location_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_user_locations_validate_company ON user_locations;
CREATE TRIGGER trg_user_locations_validate_company
BEFORE INSERT OR UPDATE OF user_id, location_id ON user_locations
FOR EACH ROW EXECUTE FUNCTION calendra_validate_user_location_scope();

-- Recurring bookable availability is branch-owned and the selected consultant must be eligible
-- for that branch. Company-wide consultants remain valid through available_all_locations=true.
CREATE OR REPLACE FUNCTION calendra_validate_bookable_slot_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
DECLARE consultant_company_id BIGINT;
DECLARE consultant_all_locations BOOLEAN;
DECLARE consultant_allowed BOOLEAN;
BEGIN
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    SELECT company_id, available_all_locations
      INTO consultant_company_id, consultant_all_locations
      FROM users WHERE id = NEW.consultant_id;

    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Bookable slot location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF consultant_company_id IS NULL OR consultant_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Bookable slot consultant % does not belong to company %', NEW.consultant_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NOT COALESCE(consultant_all_locations, TRUE) THEN
        SELECT EXISTS(
            SELECT 1 FROM user_locations ul
             WHERE ul.user_id = NEW.consultant_id
               AND ul.location_id = NEW.location_id
        ) INTO consultant_allowed;
        IF NOT consultant_allowed THEN
            RAISE EXCEPTION 'Consultant % is not assigned to location %', NEW.consultant_id, NEW.location_id
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_bookable_slot_validate_location ON bookable_slot;
CREATE TRIGGER trg_bookable_slot_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id, consultant_id ON bookable_slot
FOR EACH ROW EXECUTE FUNCTION calendra_validate_bookable_slot_location();


-- ============================================================================
-- Commerce Location Scope
-- ============================================================================

-- Phase 5.5C: explicit all/selected Location scope for commerce definitions and wallet rights.

ALTER TABLE guest_products
    ADD COLUMN IF NOT EXISTS available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS guest_product_locations (
    product_id BIGINT NOT NULL REFERENCES guest_products(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (product_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_guest_product_locations_location ON guest_product_locations(location_id, product_id);

ALTER TABLE payment_methods
    ADD COLUMN IF NOT EXISTS available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS payment_method_locations (
    payment_method_id BIGINT NOT NULL REFERENCES payment_methods(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (payment_method_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_payment_method_locations_location ON payment_method_locations(location_id, payment_method_id);

ALTER TABLE guest_entitlements
    ADD COLUMN IF NOT EXISTS available_all_locations BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE IF NOT EXISTS guest_entitlement_locations (
    entitlement_id BIGINT NOT NULL REFERENCES guest_entitlements(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    PRIMARY KEY (entitlement_id, location_id)
);
CREATE INDEX IF NOT EXISTS idx_guest_entitlement_locations_location ON guest_entitlement_locations(location_id, entitlement_id);

ALTER TABLE guest_orders ALTER COLUMN location_id SET NOT NULL;


-- Every entitlement consumption is operational activity and therefore carries the physical branch
-- where it happened. Booking-linked usages use the booking branch; standalone scans
-- fall back to the originating order branch and finally to the company's default/first branch.
ALTER TABLE guest_entitlement_usages
    ADD COLUMN IF NOT EXISTS location_id BIGINT REFERENCES locations(id) ON DELETE RESTRICT;

ALTER TABLE guest_entitlement_usages ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_guest_entitlement_usages_location_used
    ON guest_entitlement_usages(location_id, used_at DESC, id DESC);

-- Join-table guardrails. A location allowlist may only contain locations belonging to the same company.
CREATE OR REPLACE FUNCTION validate_guest_product_location_scope()
RETURNS trigger AS $$
DECLARE
    product_company BIGINT;
    location_company BIGINT;
BEGIN
    SELECT company_id INTO product_company FROM guest_products WHERE id = NEW.product_id;
    SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
    IF product_company IS NULL OR location_company IS NULL OR product_company <> location_company THEN
        RAISE EXCEPTION 'Guest product location must belong to the same company' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_guest_product_location_scope ON guest_product_locations;
CREATE TRIGGER trg_validate_guest_product_location_scope
BEFORE INSERT OR UPDATE ON guest_product_locations
FOR EACH ROW EXECUTE FUNCTION validate_guest_product_location_scope();

CREATE OR REPLACE FUNCTION validate_payment_method_location_scope()
RETURNS trigger AS $$
DECLARE
    method_company BIGINT;
    location_company BIGINT;
BEGIN
    SELECT company_id INTO method_company FROM payment_methods WHERE id = NEW.payment_method_id;
    SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
    IF method_company IS NULL OR location_company IS NULL OR method_company <> location_company THEN
        RAISE EXCEPTION 'Payment method location must belong to the same company' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_payment_method_location_scope ON payment_method_locations;
CREATE TRIGGER trg_validate_payment_method_location_scope
BEFORE INSERT OR UPDATE ON payment_method_locations
FOR EACH ROW EXECUTE FUNCTION validate_payment_method_location_scope();

CREATE OR REPLACE FUNCTION validate_guest_entitlement_location_scope()
RETURNS trigger AS $$
DECLARE
    entitlement_company BIGINT;
    location_company BIGINT;
BEGIN
    SELECT company_id INTO entitlement_company FROM guest_entitlements WHERE id = NEW.entitlement_id;
    SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
    IF entitlement_company IS NULL OR location_company IS NULL OR entitlement_company <> location_company THEN
        RAISE EXCEPTION 'Guest entitlement location must belong to the same company' USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_guest_entitlement_location_scope ON guest_entitlement_locations;
CREATE TRIGGER trg_validate_guest_entitlement_location_scope
BEFORE INSERT OR UPDATE ON guest_entitlement_locations
FOR EACH ROW EXECUTE FUNCTION validate_guest_entitlement_location_scope();

CREATE OR REPLACE FUNCTION validate_guest_entitlement_usage_location()
RETURNS trigger AS $$
DECLARE
    entitlement_company BIGINT;
    location_company BIGINT;
    booking_location BIGINT;
    service_booking_location BIGINT;
BEGIN
    SELECT company_id INTO entitlement_company FROM guest_entitlements WHERE id = NEW.entitlement_id;
    SELECT company_id INTO location_company FROM locations WHERE id = NEW.location_id;
    IF entitlement_company IS NULL OR location_company IS NULL OR entitlement_company <> location_company THEN
        RAISE EXCEPTION 'Guest entitlement usage location must belong to the same company as the entitlement' USING ERRCODE = '23514';
    END IF;

    IF NEW.session_booking_id IS NOT NULL THEN
        SELECT location_id INTO booking_location FROM session_booking WHERE id = NEW.session_booking_id;
        IF booking_location IS NULL OR booking_location <> NEW.location_id THEN
            RAISE EXCEPTION 'Guest entitlement usage location must match the linked booking location' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF NEW.session_service_id IS NOT NULL THEN
        SELECT booking.location_id INTO service_booking_location
        FROM session_service service
        JOIN session_booking booking ON booking.id = service.session_booking_id
        WHERE service.id = NEW.session_service_id;
        IF service_booking_location IS NULL OR service_booking_location <> NEW.location_id THEN
            RAISE EXCEPTION 'Guest entitlement usage location must match the linked service booking location' USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_guest_entitlement_usage_location ON guest_entitlement_usages;
CREATE TRIGGER trg_validate_guest_entitlement_usage_location
BEFORE INSERT OR UPDATE ON guest_entitlement_usages
FOR EACH ROW EXECUTE FUNCTION validate_guest_entitlement_usage_location();


-- ============================================================================
-- Consumable Location Inventory
-- ============================================================================

-- Consumables are a shared company SKU catalog with per-location physical stock,
-- reorder thresholds, and valuation cost.

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_id_company ON consumable(id, company_id);

CREATE TABLE IF NOT EXISTS consumable_location_stock (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    current_stock NUMERIC(19, 4) NOT NULL DEFAULT 0,
    minimum_stock NUMERIC(19, 4) NOT NULL DEFAULT 0,
    cost_price NUMERIC(19, 4) NOT NULL DEFAULT 0,
    CONSTRAINT uq_consumable_location_stock UNIQUE (consumable_id, location_id),
    CONSTRAINT fk_consumable_location_stock_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_location_stock_consumable_company FOREIGN KEY (consumable_id, company_id)
        REFERENCES consumable(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_location_stock_location_company FOREIGN KEY (location_id, company_id)
        REFERENCES locations(id, company_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_consumable_location_stock_company_location
    ON consumable_location_stock(company_id, location_id, consumable_id);
CREATE INDEX IF NOT EXISTS idx_consumable_location_stock_low_stock
    ON consumable_location_stock(company_id, location_id, current_stock, minimum_stock);

-- Immutable stock movements always carry their physical location.
ALTER TABLE consumable_stock_movement ADD COLUMN IF NOT EXISTS location_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_consumable_stock_movement_location_company') THEN
        ALTER TABLE consumable_stock_movement
            ADD CONSTRAINT fk_consumable_stock_movement_location_company
            FOREIGN KEY (location_id, company_id) REFERENCES locations(id, company_id);
    END IF;
END $$;
ALTER TABLE consumable_stock_movement ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumable_stock_movement_company_location_created
    ON consumable_stock_movement(company_id, location_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_consumable_stock_movement_location_consumable_created
    ON consumable_stock_movement(location_id, consumable_id, created_at DESC, id DESC);

-- Purchase orders always have one receiving branch.
ALTER TABLE consumable_purchase_order ADD COLUMN IF NOT EXISTS location_id BIGINT;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_consumable_purchase_order_location_company') THEN
        ALTER TABLE consumable_purchase_order
            ADD CONSTRAINT fk_consumable_purchase_order_location_company
            FOREIGN KEY (location_id, company_id) REFERENCES locations(id, company_id);
    END IF;
END $$;
ALTER TABLE consumable_purchase_order ALTER COLUMN location_id SET NOT NULL;
CREATE INDEX IF NOT EXISTS idx_consumable_purchase_order_company_location_date
    ON consumable_purchase_order(company_id, location_id, order_date DESC, id DESC);

-- Guard application and ad-hoc SQL writers from ever crossing Company/Location/Consumable boundaries.
CREATE OR REPLACE FUNCTION calendra_validate_consumable_location_stock()
RETURNS trigger AS $$
DECLARE consumable_company_id BIGINT;
DECLARE consumable_tracks_stock BOOLEAN;
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id, track_stock INTO consumable_company_id, consumable_tracks_stock
      FROM consumable WHERE id = NEW.consumable_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF consumable_company_id IS NULL OR consumable_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Consumable % does not belong to company %', NEW.consumable_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Inventory location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NEW.minimum_stock < 0 OR NEW.cost_price < 0 THEN
        RAISE EXCEPTION 'Consumable location minimum stock and cost must not be negative'
            USING ERRCODE = '23514';
    END IF;
    IF COALESCE(consumable_tracks_stock, TRUE) AND NEW.current_stock < 0 THEN
        RAISE EXCEPTION 'Tracked consumable location stock must not be negative'
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consumable_location_stock_validate ON consumable_location_stock;
CREATE TRIGGER trg_consumable_location_stock_validate
BEFORE INSERT OR UPDATE OF company_id, consumable_id, location_id, current_stock, minimum_stock, cost_price
ON consumable_location_stock
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_location_stock();

CREATE OR REPLACE FUNCTION calendra_validate_consumable_stock_movement_location()
RETURNS trigger AS $$
DECLARE consumable_company_id BIGINT;
DECLARE location_company_id BIGINT;
DECLARE session_location_id BIGINT;
BEGIN
    SELECT company_id INTO consumable_company_id FROM consumable WHERE id = NEW.consumable_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF consumable_company_id IS NULL OR consumable_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Movement consumable % does not belong to company %', NEW.consumable_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Movement location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NEW.source_type = 'SESSION' AND NEW.source_id IS NOT NULL AND NEW.movement_type = 'SESSION_USAGE' THEN
        SELECT sb.location_id INTO session_location_id
          FROM session_consumable sc
          JOIN session_booking sb ON sb.id = sc.session_booking_id
         WHERE sc.id = NEW.source_id
           AND sc.company_id = NEW.company_id;
        IF session_location_id IS NULL THEN
            RAISE EXCEPTION 'Session stock movement source % has no booking location', NEW.source_id
                USING ERRCODE = '23514';
        END IF;
        IF session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Session stock movement must use the booking location'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.source_type = 'SESSION' AND NEW.source_id IS NOT NULL AND NEW.movement_type = 'RETURN' THEN
        SELECT m.location_id INTO session_location_id
          FROM consumable_stock_movement m
         WHERE m.company_id = NEW.company_id
           AND m.source_type = 'SESSION'
           AND m.movement_type = 'SESSION_USAGE'
           AND m.source_id = NEW.source_id
         ORDER BY m.id ASC
         LIMIT 1;
        IF session_location_id IS NULL OR session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Session stock return must use the original usage location'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consumable_stock_movement_validate_location ON consumable_stock_movement;
CREATE TRIGGER trg_consumable_stock_movement_validate_location
BEFORE INSERT OR UPDATE OF company_id, consumable_id, location_id, movement_type, source_type, source_id
ON consumable_stock_movement
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_stock_movement_location();

CREATE OR REPLACE FUNCTION calendra_validate_consumable_purchase_order_location()
RETURNS trigger AS $$
DECLARE location_company_id BIGINT;
BEGIN
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Purchase order location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consumable_purchase_order_validate_location ON consumable_purchase_order;
CREATE TRIGGER trg_consumable_purchase_order_validate_location
BEFORE INSERT OR UPDATE OF company_id, location_id ON consumable_purchase_order
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_purchase_order_location();

-- Keep the catalog/stock matrix usable when a location or SKU is created later. New pairs start at
-- zero; branch-specific minimum stock and cost are intentionally configured explicitly afterwards.
CREATE OR REPLACE FUNCTION calendra_initialize_inventory_for_location()
RETURNS trigger AS $$
BEGIN
    INSERT INTO consumable_location_stock(
        created_at, updated_at, company_id, consumable_id, location_id,
        current_stock, minimum_stock, cost_price
    )
    SELECT current_timestamp, current_timestamp, NEW.company_id, c.id, NEW.id, 0, 0, 0
      FROM consumable c
     WHERE c.company_id = NEW.company_id
    ON CONFLICT (consumable_id, location_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_location_initialize_inventory ON locations;
CREATE TRIGGER trg_location_initialize_inventory
AFTER INSERT ON locations
FOR EACH ROW EXECUTE FUNCTION calendra_initialize_inventory_for_location();

CREATE OR REPLACE FUNCTION calendra_initialize_inventory_for_consumable()
RETURNS trigger AS $$
BEGIN
    INSERT INTO consumable_location_stock(
        created_at, updated_at, company_id, consumable_id, location_id,
        current_stock, minimum_stock, cost_price
    )
    SELECT current_timestamp, current_timestamp, NEW.company_id, NEW.id, l.id, 0, 0, 0
      FROM locations l
     WHERE l.company_id = NEW.company_id
    ON CONFLICT (consumable_id, location_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_consumable_initialize_inventory ON consumable;
CREATE TRIGGER trg_consumable_initialize_inventory
AFTER INSERT ON consumable
FOR EACH ROW EXECUTE FUNCTION calendra_initialize_inventory_for_consumable();



-- ============================================================================
-- Location Rule Pricing Overrides
-- ============================================================================

-- Phase 5.5E: company defaults with optional per-location operational overrides.

CREATE TABLE location_setting_overrides (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    setting_key VARCHAR(255) NOT NULL,
    value TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_location_setting_override UNIQUE (company_id, location_id, setting_key)
);

CREATE INDEX idx_location_setting_overrides_company_location
    ON location_setting_overrides(company_id, location_id);

CREATE TABLE session_type_location_prices (
    id BIGSERIAL PRIMARY KEY,
    company_id BIGINT NOT NULL REFERENCES company(id) ON DELETE CASCADE,
    session_type_id BIGINT NOT NULL REFERENCES session_type(id) ON DELETE CASCADE,
    transaction_service_id BIGINT NOT NULL REFERENCES transaction_service(id) ON DELETE CASCADE,
    location_id BIGINT NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    price NUMERIC(12,4) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_session_type_location_price UNIQUE (session_type_id, transaction_service_id, location_id)
);

CREATE INDEX idx_session_type_location_prices_company_location
    ON session_type_location_prices(company_id, location_id);
CREATE INDEX idx_session_type_location_prices_type_location
    ON session_type_location_prices(session_type_id, location_id);

CREATE OR REPLACE FUNCTION calendra_validate_location_setting_override()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations l
        WHERE l.id = NEW.location_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_location_setting_override_company
BEFORE INSERT OR UPDATE ON location_setting_overrides
FOR EACH ROW EXECUTE FUNCTION calendra_validate_location_setting_override();

CREATE OR REPLACE FUNCTION calendra_validate_session_type_location_price()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations l
        WHERE l.id = NEW.location_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Location % does not belong to company %', NEW.location_id, NEW.company_id;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM session_type st
        WHERE st.id = NEW.session_type_id AND st.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Session type % does not belong to company %', NEW.session_type_id, NEW.company_id;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM transaction_service ts
        WHERE ts.id = NEW.transaction_service_id AND ts.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Transaction service % does not belong to company %', NEW.transaction_service_id, NEW.company_id;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM type_transaction_services tts
        WHERE tts.session_type_id = NEW.session_type_id
          AND tts.transaction_service_id = NEW.transaction_service_id
    ) THEN
        RAISE EXCEPTION 'Transaction service % is not linked to session type %', NEW.transaction_service_id, NEW.session_type_id;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_session_type_location_price_company
BEFORE INSERT OR UPDATE ON session_type_location_prices
FOR EACH ROW EXECUTE FUNCTION calendra_validate_session_type_location_price();


-- ============================================================================
-- Location Rule Pricing Override Sqlstates
-- ============================================================================

-- Normalize tenant/location validation failures to SQLSTATE class 23 so Spring
-- translates them as data-integrity violations rather than uncategorized SQL errors.

CREATE OR REPLACE FUNCTION calendra_validate_location_setting_override()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations l
        WHERE l.id = NEW.location_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION calendra_validate_session_type_location_price()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM locations l
        WHERE l.id = NEW.location_id AND l.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM session_type st
        WHERE st.id = NEW.session_type_id AND st.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Session type % does not belong to company %', NEW.session_type_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM transaction_service ts
        WHERE ts.id = NEW.transaction_service_id AND ts.company_id = NEW.company_id
    ) THEN
        RAISE EXCEPTION 'Transaction service % does not belong to company %', NEW.transaction_service_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM type_transaction_services tts
        WHERE tts.session_type_id = NEW.session_type_id
          AND tts.transaction_service_id = NEW.transaction_service_id
    ) THEN
        RAISE EXCEPTION 'Transaction service % is not linked to session type %', NEW.transaction_service_id, NEW.session_type_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$;


-- ============================================================================
-- Performance Hot Path Indexes
-- ============================================================================

-- Phase 6 performance hardening: indexes for the hot reads introduced by runtime diagnostics
-- and batched calendar pricing. These are additive/idempotent and do not change application data.

CREATE INDEX IF NOT EXISTS idx_app_settings_key_updated_id
    ON app_settings (key, updated_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_session_type_location_prices_company_location_type_tx
    ON session_type_location_prices (company_id, location_id, session_type_id, transaction_service_id);


-- ============================================================================
-- Client Email Unique Per Tenant
-- ============================================================================

-- Email is the tenant-local identity key for person clients/guests. Company/proxy
-- billing clients may legitimately share a finance contact email.
CREATE UNIQUE INDEX IF NOT EXISTS uq_clients_company_normalized_email
    ON clients (company_id, lower(trim(email)))
    WHERE invoice_recipient_type = 'PERSON'
      AND email IS NOT NULL
      AND trim(email) <> '';


-- ============================================================================
-- Guest Product Service Scope And Invoice Item
-- ============================================================================

-- Wallet entitlements can be valid for multiple booking services while using a
-- separate transaction service for invoicing/VAT. Keep guest_products.session_type_id
-- as a backwards-compatible primary service pointer while the join table becomes
-- the authoritative scope for non-voucher entitlements when it has rows.
CREATE TABLE IF NOT EXISTS guest_product_session_types (
    product_id BIGINT NOT NULL,
    session_type_id BIGINT NOT NULL,
    PRIMARY KEY (product_id, session_type_id),
    CONSTRAINT fk_guest_product_session_types_product
        FOREIGN KEY (product_id) REFERENCES guest_products(id) ON DELETE CASCADE,
    CONSTRAINT fk_guest_product_session_types_session_type
        FOREIGN KEY (session_type_id) REFERENCES session_type(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_guest_product_session_types_session_type
    ON guest_product_session_types(session_type_id);


-- ============================================================================
-- Guest Product Service Group Scope
-- ============================================================================

-- Ugodnosti may be scoped to a service group. The existing explicit service rows remain as
-- a snapshot/fallback; service_group_id is authoritative while present so group membership can
-- change without having to edit every benefit.
ALTER TABLE guest_products
    ADD COLUMN IF NOT EXISTS service_group_id BIGINT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'fk_guest_products_service_group'
    ) THEN
        ALTER TABLE guest_products
            ADD CONSTRAINT fk_guest_products_service_group
            FOREIGN KEY (service_group_id)
            REFERENCES service_group(id)
            ON DELETE SET NULL
           ;
    END IF;
END $$;

ALTER TABLE guest_products VALIDATE CONSTRAINT fk_guest_products_service_group;

CREATE INDEX IF NOT EXISTS idx_guest_products_service_group_id
    ON guest_products(service_group_id)
    WHERE service_group_id IS NOT NULL;


-- ============================================================================
-- Normalize Session Consumable Per Participant Quantity
-- ============================================================================

-- Preserve an explicit appointment-level override even when the user intentionally
-- removes every consumable row. Without this marker a later unrelated appointment
-- edit would recreate service defaults because an empty list was indistinguishable
-- from "defaults have not been materialized yet".
ALTER TABLE session_booking
    ADD COLUMN IF NOT EXISTS session_consumables_overridden BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================================
-- Session Consumable Billing Snapshots
-- ============================================================================

-- Phase: billable session consumables -> open bill / invoice lines.
-- Keep captured pricing and VAT stable even when the consumable catalogue changes later.
ALTER TABLE consumable
    ADD COLUMN IF NOT EXISTS vat_rate VARCHAR(32) NOT NULL DEFAULT 'NO_VAT';

ALTER TABLE session_consumable
    ADD COLUMN IF NOT EXISTS item_name_snapshot VARCHAR(160),
    ADD COLUMN IF NOT EXISTS vat_rate_snapshot VARCHAR(32) NOT NULL DEFAULT 'NO_VAT';

ALTER TABLE session_consumable
    ALTER COLUMN item_name_snapshot SET NOT NULL;

-- Open-bill lines keep a stable source pointer so repeated appointment saves are idempotent.
ALTER TABLE open_bill_items
    ADD COLUMN IF NOT EXISTS source_session_consumable_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_open_bill_items_source_session_consumable
    ON open_bill_items(source_session_consumable_id, open_bill_id);

-- Preserve the source on the immutable invoice line for audit/debugging.
ALTER TABLE bill_item
    ADD COLUMN IF NOT EXISTS source_session_consumable_id BIGINT;

CREATE INDEX IF NOT EXISTS idx_bill_item_source_session_consumable
    ON bill_item(source_session_consumable_id, bill_id);

-- Billing still requires a TransactionService for VAT/tax reporting. Consumables use hidden,
-- system-generated carrier services (one per VAT rate per tenant); the actual article name and
-- price are always taken from the session snapshot / invoice_line_description.
ALTER TABLE transaction_service
    ADD COLUMN IF NOT EXISTS system_generated BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS system_source VARCHAR(32),
    ADD COLUMN IF NOT EXISTS system_source_key VARCHAR(80);

CREATE UNIQUE INDEX IF NOT EXISTS uq_transaction_service_system_source
    ON transaction_service(company_id, system_source, system_source_key)
    WHERE system_generated = TRUE
      AND system_source IS NOT NULL
      AND system_source_key IS NOT NULL;


-- ============================================================================
-- Consumable Procurement Lines And Receipts
-- ============================================================================

-- Procurement phase: real purchase-order lines, partial receiving and idempotent receipt events.
-- Purchase orders may be created as header-only records and remain valid
-- and simply start with zero lines.

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_purchase_order_id_company
    ON consumable_purchase_order(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_supplier_id_company
    ON consumable_supplier(id, company_id);

CREATE TABLE IF NOT EXISTS consumable_purchase_order_line (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    purchase_order_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    item_name_snapshot VARCHAR(180) NOT NULL,
    unit_snapshot VARCHAR(32) NOT NULL,
    ordered_quantity NUMERIC(19,4) NOT NULL,
    received_quantity NUMERIC(19,4) NOT NULL DEFAULT 0,
    unit_price NUMERIC(19,4) NOT NULL DEFAULT 0,
    vat_rate VARCHAR(24) NOT NULL DEFAULT 'NO_VAT',
    CONSTRAINT uq_consumable_purchase_order_line_item UNIQUE (purchase_order_id, consumable_id),
    CONSTRAINT fk_consumable_po_line_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_line_order_company FOREIGN KEY (purchase_order_id, company_id)
        REFERENCES consumable_purchase_order(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_line_consumable_company FOREIGN KEY (consumable_id, company_id)
        REFERENCES consumable(id, company_id),
    CONSTRAINT chk_consumable_po_line_qty CHECK (ordered_quantity > 0 AND received_quantity >= 0 AND received_quantity <= ordered_quantity),
    CONSTRAINT chk_consumable_po_line_price CHECK (unit_price >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_po_line_id_company
    ON consumable_purchase_order_line(id, company_id);

CREATE INDEX IF NOT EXISTS idx_consumable_po_line_company_order
    ON consumable_purchase_order_line(company_id, purchase_order_id, id);
CREATE INDEX IF NOT EXISTS idx_consumable_po_line_company_consumable
    ON consumable_purchase_order_line(company_id, consumable_id);

CREATE TABLE IF NOT EXISTS consumable_purchase_order_receipt (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    purchase_order_id BIGINT NOT NULL,
    idempotency_key VARCHAR(100) NOT NULL,
    received_at TIMESTAMP WITH TIME ZONE NOT NULL,
    note TEXT,
    created_by_id BIGINT,
    CONSTRAINT uq_consumable_po_receipt_idempotency UNIQUE (purchase_order_id, idempotency_key),
    CONSTRAINT fk_consumable_po_receipt_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_receipt_order_company FOREIGN KEY (purchase_order_id, company_id)
        REFERENCES consumable_purchase_order(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_receipt_user FOREIGN KEY (created_by_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_po_receipt_id_company
    ON consumable_purchase_order_receipt(id, company_id);

CREATE INDEX IF NOT EXISTS idx_consumable_po_receipt_company_order_received
    ON consumable_purchase_order_receipt(company_id, purchase_order_id, received_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS consumable_purchase_order_receipt_line (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    receipt_id BIGINT NOT NULL,
    purchase_order_line_id BIGINT NOT NULL,
    quantity NUMERIC(19,4) NOT NULL,
    CONSTRAINT uq_consumable_po_receipt_line UNIQUE (receipt_id, purchase_order_line_id),
    CONSTRAINT fk_consumable_po_receipt_line_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_receipt_line_receipt_company FOREIGN KEY (receipt_id, company_id)
        REFERENCES consumable_purchase_order_receipt(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_po_receipt_line_order_line_company FOREIGN KEY (purchase_order_line_id, company_id)
        REFERENCES consumable_purchase_order_line(id, company_id),
    CONSTRAINT chk_consumable_po_receipt_line_qty CHECK (quantity > 0)
);

CREATE INDEX IF NOT EXISTS idx_consumable_po_receipt_line_receipt
    ON consumable_purchase_order_receipt_line(receipt_id, id);

-- Prevent cross-tenant supplier assignment at the database layer as well.
CREATE OR REPLACE FUNCTION calendra_validate_consumable_purchase_order_supplier()
RETURNS trigger AS $$
DECLARE supplier_company_id BIGINT;
BEGIN
    IF NEW.supplier_id IS NULL THEN
        RETURN NEW;
    END IF;
    SELECT company_id INTO supplier_company_id FROM consumable_supplier WHERE id = NEW.supplier_id;
    IF supplier_company_id IS NULL OR supplier_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Purchase order supplier % does not belong to company %', NEW.supplier_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consumable_purchase_order_validate_supplier ON consumable_purchase_order;
CREATE TRIGGER trg_consumable_purchase_order_validate_supplier
BEFORE INSERT OR UPDATE OF company_id, supplier_id ON consumable_purchase_order
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_purchase_order_supplier();


-- ============================================================================
-- Consumable Inventory Sessions
-- ============================================================================

-- Inventory sessions preserve a physical-count snapshot and only affect live stock when finalized.
-- This makes inventory auditable and prevents draft counts from changing stock.

CREATE TABLE IF NOT EXISTS consumable_inventory_session (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    location_id BIGINT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'IN_PROGRESS',
    started_at TIMESTAMP WITH TIME ZONE NOT NULL,
    completed_at TIMESTAMP WITH TIME ZONE,
    started_by_id BIGINT,
    completed_by_id BIGINT,
    notes TEXT,
    CONSTRAINT fk_consumable_inventory_session_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_inventory_session_location_company FOREIGN KEY (location_id, company_id)
        REFERENCES locations(id, company_id),
    CONSTRAINT fk_consumable_inventory_session_started_by FOREIGN KEY (started_by_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT fk_consumable_inventory_session_completed_by FOREIGN KEY (completed_by_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_consumable_inventory_session_status CHECK (status IN ('IN_PROGRESS', 'COMPLETED'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_inventory_session_id_company
    ON consumable_inventory_session(id, company_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_inventory_session_active_location
    ON consumable_inventory_session(company_id, location_id)
    WHERE status = 'IN_PROGRESS';
CREATE INDEX IF NOT EXISTS idx_consumable_inventory_session_company_location_started
    ON consumable_inventory_session(company_id, location_id, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS consumable_inventory_line (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    inventory_session_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    item_name_snapshot VARCHAR(180) NOT NULL,
    category_name_snapshot VARCHAR(140),
    unit_snapshot VARCHAR(32) NOT NULL,
    system_quantity NUMERIC(19,4) NOT NULL,
    counted_quantity NUMERIC(19,4),
    cost_price_snapshot NUMERIC(19,4) NOT NULL DEFAULT 0,
    counted_at TIMESTAMP WITH TIME ZONE,
    counted_by_id BIGINT,
    notes TEXT,
    CONSTRAINT uq_consumable_inventory_line_item UNIQUE (inventory_session_id, consumable_id),
    CONSTRAINT fk_consumable_inventory_line_company FOREIGN KEY (company_id) REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_inventory_line_session_company FOREIGN KEY (inventory_session_id, company_id)
        REFERENCES consumable_inventory_session(id, company_id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_inventory_line_consumable_company FOREIGN KEY (consumable_id, company_id)
        REFERENCES consumable(id, company_id),
    CONSTRAINT fk_consumable_inventory_line_counted_by FOREIGN KEY (counted_by_id) REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_consumable_inventory_line_system_qty CHECK (system_quantity >= 0),
    CONSTRAINT chk_consumable_inventory_line_counted_qty CHECK (counted_quantity IS NULL OR counted_quantity >= 0),
    CONSTRAINT chk_consumable_inventory_line_cost CHECK (cost_price_snapshot >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_inventory_line_id_company
    ON consumable_inventory_line(id, company_id);
CREATE INDEX IF NOT EXISTS idx_consumable_inventory_line_company_session
    ON consumable_inventory_line(company_id, inventory_session_id, id);

-- One finalization may create at most one inventory movement per article/location.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_inventory_count_movement_source
    ON consumable_stock_movement(company_id, source_type, source_id, consumable_id, location_id)
    WHERE source_type = 'INVENTORY_COUNT' AND source_id IS NOT NULL;


-- ============================================================================
-- Consumable Stock Transfers
-- ============================================================================

-- Atomic stock transfers between operating locations.
-- One transfer creates exactly one TRANSFER_OUT movement and one TRANSFER_IN movement,
-- both linked back to the immutable transfer record through source_id.

CREATE TABLE IF NOT EXISTS consumable_stock_transfer (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL,
    company_id BIGINT NOT NULL,
    consumable_id BIGINT NOT NULL,
    from_location_id BIGINT NOT NULL,
    to_location_id BIGINT NOT NULL,
    item_name_snapshot VARCHAR(180) NOT NULL,
    unit_snapshot VARCHAR(32) NOT NULL,
    quantity NUMERIC(19,4) NOT NULL,
    unit_cost_snapshot NUMERIC(19,4) NOT NULL DEFAULT 0,
    value_amount NUMERIC(19,4) NOT NULL DEFAULT 0,
    idempotency_key VARCHAR(120) NOT NULL,
    note TEXT,
    created_by_id BIGINT,
    CONSTRAINT fk_consumable_stock_transfer_company FOREIGN KEY (company_id)
        REFERENCES company(id) ON DELETE CASCADE,
    CONSTRAINT fk_consumable_stock_transfer_consumable_company FOREIGN KEY (consumable_id, company_id)
        REFERENCES consumable(id, company_id),
    CONSTRAINT fk_consumable_stock_transfer_from_location_company FOREIGN KEY (from_location_id, company_id)
        REFERENCES locations(id, company_id),
    CONSTRAINT fk_consumable_stock_transfer_to_location_company FOREIGN KEY (to_location_id, company_id)
        REFERENCES locations(id, company_id),
    CONSTRAINT fk_consumable_stock_transfer_created_by FOREIGN KEY (created_by_id)
        REFERENCES users(id) ON DELETE SET NULL,
    CONSTRAINT chk_consumable_stock_transfer_distinct_locations CHECK (from_location_id <> to_location_id),
    CONSTRAINT chk_consumable_stock_transfer_quantity CHECK (quantity > 0),
    CONSTRAINT chk_consumable_stock_transfer_cost CHECK (unit_cost_snapshot >= 0 AND value_amount >= 0),
    CONSTRAINT uq_consumable_stock_transfer_company_key UNIQUE (company_id, idempotency_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_stock_transfer_id_company
    ON consumable_stock_transfer(id, company_id);
CREATE INDEX IF NOT EXISTS idx_consumable_stock_transfer_company_created
    ON consumable_stock_transfer(company_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_consumable_stock_transfer_company_from_created
    ON consumable_stock_transfer(company_id, from_location_id, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_consumable_stock_transfer_company_to_created
    ON consumable_stock_transfer(company_id, to_location_id, created_at DESC, id DESC);

-- An idempotent transfer may produce at most one movement in each direction.
CREATE UNIQUE INDEX IF NOT EXISTS uq_consumable_stock_transfer_movement_direction
    ON consumable_stock_movement(company_id, source_type, source_id, movement_type)
    WHERE source_type = 'TRANSFER' AND source_id IS NOT NULL;

-- Extend the existing movement integrity trigger so ad-hoc SQL writers cannot attach transfer
-- movements to the wrong SKU or branch, or reverse their signs.
CREATE OR REPLACE FUNCTION calendra_validate_consumable_stock_movement_location()
RETURNS trigger AS $$
DECLARE consumable_company_id BIGINT;
DECLARE location_company_id BIGINT;
DECLARE session_location_id BIGINT;
DECLARE transfer_consumable_id BIGINT;
DECLARE transfer_from_location_id BIGINT;
DECLARE transfer_to_location_id BIGINT;
BEGIN
    SELECT company_id INTO consumable_company_id FROM consumable WHERE id = NEW.consumable_id;
    SELECT company_id INTO location_company_id FROM locations WHERE id = NEW.location_id;
    IF consumable_company_id IS NULL OR consumable_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Movement consumable % does not belong to company %', NEW.consumable_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;
    IF location_company_id IS NULL OR location_company_id <> NEW.company_id THEN
        RAISE EXCEPTION 'Movement location % does not belong to company %', NEW.location_id, NEW.company_id
            USING ERRCODE = '23514';
    END IF;

    IF NEW.source_type = 'SESSION' AND NEW.source_id IS NOT NULL AND NEW.movement_type = 'SESSION_USAGE' THEN
        SELECT sb.location_id INTO session_location_id
          FROM session_consumable sc
          JOIN session_booking sb ON sb.id = sc.session_booking_id
         WHERE sc.id = NEW.source_id
           AND sc.company_id = NEW.company_id;
        IF session_location_id IS NULL THEN
            RAISE EXCEPTION 'Session stock movement source % has no booking location', NEW.source_id
                USING ERRCODE = '23514';
        END IF;
        IF session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Session stock movement must use the booking location'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.source_type = 'SESSION' AND NEW.source_id IS NOT NULL AND NEW.movement_type = 'RETURN' THEN
        SELECT m.location_id INTO session_location_id
          FROM consumable_stock_movement m
         WHERE m.company_id = NEW.company_id
           AND m.source_type = 'SESSION'
           AND m.movement_type = 'SESSION_USAGE'
           AND m.source_id = NEW.source_id
         ORDER BY m.id ASC
         LIMIT 1;
        IF session_location_id IS NULL OR session_location_id <> NEW.location_id THEN
            RAISE EXCEPTION 'Session stock return must use the original usage location'
                USING ERRCODE = '23514';
        END IF;
    ELSIF NEW.source_type = 'TRANSFER' AND NEW.source_id IS NOT NULL THEN
        SELECT t.consumable_id, t.from_location_id, t.to_location_id
          INTO transfer_consumable_id, transfer_from_location_id, transfer_to_location_id
          FROM consumable_stock_transfer t
         WHERE t.id = NEW.source_id
           AND t.company_id = NEW.company_id;
        IF transfer_consumable_id IS NULL THEN
            RAISE EXCEPTION 'Transfer stock movement source % does not exist', NEW.source_id
                USING ERRCODE = '23514';
        END IF;
        IF transfer_consumable_id <> NEW.consumable_id THEN
            RAISE EXCEPTION 'Transfer movement must use the transfer consumable'
                USING ERRCODE = '23514';
        END IF;
        IF NEW.movement_type = 'TRANSFER_OUT' THEN
            IF NEW.location_id <> transfer_from_location_id OR NEW.quantity_delta >= 0 THEN
                RAISE EXCEPTION 'Transfer-out movement must decrease stock at the source location'
                    USING ERRCODE = '23514';
            END IF;
        ELSIF NEW.movement_type = 'TRANSFER_IN' THEN
            IF NEW.location_id <> transfer_to_location_id OR NEW.quantity_delta <= 0 THEN
                RAISE EXCEPTION 'Transfer-in movement must increase stock at the destination location'
                    USING ERRCODE = '23514';
            END IF;
        ELSE
            RAISE EXCEPTION 'Transfer source requires TRANSFER_OUT or TRANSFER_IN movement type'
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_consumable_stock_movement_validate_location ON consumable_stock_movement;
CREATE TRIGGER trg_consumable_stock_movement_validate_location
BEFORE INSERT OR UPDATE OF company_id, consumable_id, location_id, movement_type, source_type, source_id, quantity_delta
ON consumable_stock_movement
FOR EACH ROW EXECUTE FUNCTION calendra_validate_consumable_stock_movement_location();-- ============================================================================
-- Consumables Dedicated Permissions
-- ============================================================================



-- ============================================================================
-- Client Group Default Session Type
-- ============================================================================

ALTER TABLE client_groups
    ADD COLUMN IF NOT EXISTS default_session_type_id BIGINT;

ALTER TABLE client_groups
    ADD CONSTRAINT fk_client_groups_default_session_type
        FOREIGN KEY (default_session_type_id)
        REFERENCES session_type(id)
        ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_client_groups_default_session_type
    ON client_groups(default_session_type_id);


-- ============================================================================
-- Guest Location Subscriptions
-- ============================================================================

-- Guest App provider subscriptions are location-level. Tenant links
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


-- ============================================================================
-- Location Geocoding Coordinates
-- ============================================================================

ALTER TABLE locations
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS geocode_source_address VARCHAR(1024),
    ADD COLUMN IF NOT EXISTS geocoded_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS geocode_last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS geocode_status VARCHAR(32);

CREATE INDEX IF NOT EXISTS idx_locations_public_geocoded
    ON locations (active, public_directory_enabled, geocoded_at)
    WHERE latitude IS NOT NULL AND longitude IS NOT NULL;


-- ============================================================================
-- Location Public Business Type
-- ============================================================================

-- Public directory category is location-specific and uses the same canonical values
-- as Upravljanje računa -> Podjetje -> Tip podjetja.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS public_business_type VARCHAR(64);

ALTER TABLE locations
    ADD CONSTRAINT chk_locations_public_business_type CHECK (
        public_business_type IS NULL OR public_business_type IN (
            'hair_salon',
            'beauty_salon',
            'massage',
            'spa_sauna',
            'tattooing_piercing',
            'fitness_personal_training',
            'physical_therapy',
            'psychology_counselling',
            'yoga_pilates',
            'pet_services',
            'education_coaching',
            'other'
        )
    );
