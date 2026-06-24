package com.example.app.settings;

public enum SettingKey {
    SPACES_ENABLED,
    TYPES_ENABLED,
    /** Enables course catalog and course-access entitlements. */
    COURSES_ENABLED,
    BOOKABLE_ENABLED,
    NO_SHOW_ENABLED,
    ONLINE_SESSION_BOOKING_ENABLED,
    WEBSITE_WIDGET_ENABLED,
    MODULE_CONFIG_TYPE,
    AI_BOOKING_ENABLED,
    /** Personal time blocks on the calendar (and personal-task presets tab). */
    PERSONAL_ENABLED,
    /** To-do items on the calendar and header task list. */
    TODOS_ENABLED,
    MULTIPLE_SESSIONS_PER_SPACE_ENABLED,
    MULTIPLE_CLIENTS_PER_SESSION_ENABLED,
    GROUP_BOOKING_ENABLED,
    BILLING_ENABLED,
    BILLING_INVOICES_ENABLED,
    BILLING_ONLINE_CARD_PAYMENTS_ENABLED,
    BILLING_BANK_TRANSFER_ENABLED,
    BILLING_PAYPAL_ENABLED,
    BILLING_GIFT_CARDS_ENABLED,
    /** Enables advance/deposit billing features (Predplačilo) for the tenant. */
    BILLING_ADVANCE_ENABLED,
    COMMUNICATION_ENABLED,
    INBOX_ENABLED,
    NOTIFICATIONS_ENABLED,
    NOTIFICATIONS_EMAIL_ALERTS_ENABLED,
    NOTIFICATIONS_SMS_ALERTS_ENABLED,
    NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED,
    NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED,
    GOOGLE_CALENDAR_MODULE_ENABLED,
    SCANNER_MODULE_ENABLED,
    WHATSAPP_MODULE_ENABLED,
    VIBER_MODULE_ENABLED,
    SECURITY_MODULE_ENABLED,
    SECURITY_SESSION_SECURITY_ENABLED,
    SECURITY_PASSKEYS_ENABLED,
    SECURITY_API_INTEGRATIONS_ENABLED,
    SESSION_LENGTH_MINUTES,
    WORKING_HOURS_START,
    WORKING_HOURS_END,
    PERSONAL_TASK_PRESETS_JSON,
    INVOICE_COUNTER,
    ORDER_COUNTER,

    COMPANY_NAME,
    COMPANY_ADDRESS,
    COMPANY_POSTAL_CODE,
    COMPANY_CITY,
    COMPANY_VAT_ID,
    COMPANY_IBAN,
    COMPANY_BIC,
    COMPANY_EMAIL,
    COMPANY_TELEPHONE,
    BANK_QR_PURPOSE_CODE,
    BANK_QR_PURPOSE_TEXT,
    /** JSON array of company profiles shown in Configuration -> Account Management -> Company. */
    COMPANY_PROFILES,
    /** Currently selected company profile id in Configuration -> Account Management -> Company. */
    COMPANY_SELECTED_PROFILE_ID,
    FISCAL_ENVIRONMENT,
    FISCAL_TAX_NUMBER,
    FISCAL_BUSINESS_PREMISE_ID,
    FISCAL_DEVICE_ID,
    FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER,
    FISCAL_CERTIFICATE_PASSWORD,
    FISCAL_CADASTRAL_NUMBER,
    FISCAL_BUILDING_NUMBER,
    FISCAL_BUILDING_SECTION_NUMBER,
    FISCAL_HOUSE_NUMBER,
    FISCAL_HOUSE_NUMBER_ADDITIONAL,
    FISCAL_TEST_INVOICE_URL,
    FISCAL_TEST_PREMISE_URL,
    FISCAL_PROD_INVOICE_URL,
    FISCAL_PROD_PREMISE_URL,
    FISCAL_REGISTERED_PREMISES_JSON,
    GLOBAL_FISCAL_TEST_INVOICE_URL,
    GLOBAL_FISCAL_TEST_PREMISE_URL,
    GLOBAL_FISCAL_PROD_INVOICE_URL,
    GLOBAL_FISCAL_PROD_PREMISE_URL,
    GLOBAL_MESSAGING_WHATSAPP_ENABLED,
    GLOBAL_MESSAGING_VIBER_ENABLED,
    GLOBAL_PAYMENTS_STRIPE_ENABLED,
    GLOBAL_PAYMENTS_PAYPAL_ENABLED,
    GLOBAL_AJPES_PRS_ENABLED,
    GLOBAL_CONSUMABLES_ENABLED,

    PAYMENT_DEADLINE_DAYS,
    ADVANCE_DEDUCTION_TRANSACTION_SERVICE_ID,
    /** Transaction service used when a booking participant is marked as NO SHOW. */
    NO_SHOW_TRANSACTION_SERVICE_ID,
    SIGNUP_PACKAGE_NAME,
    SIGNUP_USER_COUNT,
    SIGNUP_SMS_COUNT,
    SIGNUP_ADDON_KEYS,
    SIGNUP_FISCALIZATION_REQUIRED,
    /**
     * When {@code true}, the tenancy owner signed up without a password and must still complete the emailed setup link.
     * Cleared after they set a password via that flow.
     */
    SIGNUP_OWNER_PASSWORD_PENDING,

    /** Paid space quota for the tenancy (signup / billing). */
    TENANCY_SPACE_QUOTA,
    /** Cumulative outbound SMS parts successfully sent via the configured provider. */
    TENANCY_SMS_SENT_COUNT,
    BILLING_SUBSCRIPTION_START,
    BILLING_SUBSCRIPTION_END,
    /** MONTHLY or YEARLY */
    BILLING_SUBSCRIPTION_INTERVAL,
    /** User-seat additions activated inside the already-paid current subscription period. */
    BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT,
    /** SMS additions activated inside the already-paid current subscription period. */
    BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT,
    /** Add-ons activated inside the already-paid current subscription period; billed on the next invoice. */
    BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS,
    /** User-seat quota planned for the next subscription billing period. */
    BILLING_SUBSCRIPTION_NEXT_USER_COUNT,
    /** SMS quota planned for the next subscription billing period. */
    BILLING_SUBSCRIPTION_NEXT_SMS_COUNT,
    /** Add-ons planned for the next subscription billing period. */
    BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS,
    /** Package that takes effect at the next subscription renewal (deferred downgrade target). */
    BILLING_SUBSCRIPTION_NEXT_PACKAGE_NAME,
    /** Billing interval (MONTHLY/YEARLY) that takes effect at the next subscription renewal. */
    BILLING_SUBSCRIPTION_NEXT_INTERVAL,
    /** One-off gross amount charged on the next renewal invoice for a mid-cycle upgrade. */
    BILLING_SUBSCRIPTION_UPGRADE_DIFF_AMOUNT,
    /** Decimal amount string (e.g. EUR) still owed for subscription. */
    BILLING_SUBSCRIPTION_DUE_AMOUNT,
    /** Preferred payment method selected during self-serve signup billing details. */
    BILLING_SUBSCRIPTION_PAYMENT_METHOD,
    /** ACTIVE, SUSPENDED, or CANCELLED. Controls tenant login/access, separate from billing state. */
    TENANCY_ACCESS_STATUS,
    /** PENDING_PAYMENT, PAID, or PAST_DUE. Controls subscription payment state, separate from tenant login. */
    BILLING_SUBSCRIPTION_STATUS,
    /** Number of days after an unpaid subscription invoice before the account becomes past due. */
    BILLING_SUBSCRIPTION_GRACE_DAYS,
    /** Custom package display name saved for platform-admin-created custom plans. */
    BILLING_SUBSCRIPTION_CUSTOM_NAME,
    /** Custom monthly gross price for platform-admin-created custom plans. */
    BILLING_SUBSCRIPTION_CUSTOM_MONTHLY_PRICE,
    /** Custom yearly gross price for platform-admin-created custom plans. */
    BILLING_SUBSCRIPTION_CUSTOM_YEARLY_PRICE,
    /** CSV of enabled module/configuration keys chosen by Platform Admin for a custom package. */
    BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS,
    /** JSON snapshot of selected add-ons and optional custom/free pricing chosen by Platform Admin. */
    BILLING_SUBSCRIPTION_CUSTOM_ADDONS_JSON,
    /** Marker that the tenant was created manually from Platform Admin rather than public registration. */
    MANUAL_TENANT_CREATED,
    INVOICE_DELIVERY_EMAIL_ENABLED,
    INVOICE_DELIVERY_EMAIL_SUBJECT,
    INVOICE_DELIVERY_EMAIL_BODY,
    FOLIO_TEMPLATE_LAYOUT_JSON,
    /** JSON array of folio layout styles saved on the platform-admin tenancy and offered to all tenants. */
    PLATFORM_FOLIO_STYLES_JSON,
    /** JSON: minimum package/config-type visibility rules for App settings switches, saved on the platform-admin tenancy. */
    PLATFORM_MODULE_VISIBILITY_RULES_JSON,
    COMPANY_LOGO_BASE64,
    FOLIO_SIGNATURE_BASE64,


    /** JSON: tenant-wide public booking/reservation rules used by guest app, widget and automation. */
    TENANT_RESERVATION_RULES_JSON,

    /** JSON: custom email/SMS templates and toggles for booking notifications (see frontend parser). */
    NOTIFICATION_SETTINGS_JSON,

    /** Inbox/omnichannel messaging settings. */
    INBOX_INFOBIP_BASE_URL,
    INBOX_INFOBIP_API_KEY,
    INBOX_WHATSAPP_SENDER,
    INBOX_VIBER_SENDER,
    INBOX_WHATSAPP_ACCESS_TOKEN,
    INBOX_WHATSAPP_PHONE_NUMBER_ID,
    INBOX_WHATSAPP_BUSINESS_ACCOUNT_ID,
    INBOX_WHATSAPP_WEBHOOK_VERIFY_TOKEN,
    INBOX_WHATSAPP_APP_SECRET,
    INBOX_VIBER_BOT_TOKEN,
    INBOX_VIBER_BOT_NAME,
    INBOX_VIBER_BOT_AVATAR_URL,

    /** Owner analytics digest settings. */
    ANALYTICS_REPORTS_ENABLED,
    ANALYTICS_REPORTS_EMAIL,
    ANALYTICS_REPORTS_FREQUENCY,
    ANALYTICS_REPORTS_LAST_SENT_AT,



    /** Guest app booking/payment behavior. */
    GUEST_BOOKING_RULES_JSON,

    /** Guest app public/discoverability settings. */
    GUEST_APP_SETTINGS_JSON,

    /** Website booking widget booking/payment behavior. */
    WEBSITE_BOOKING_RULES_JSON,

    /** Website booking widget public flow settings. */
    WEBSITE_WIDGET_SETTINGS_JSON,

    /**
     * JSON: public register page plan and add-on monthly prices (EUR), merged with built-in defaults.
     * Stored on the super-admin company that last saved it; public catalog picks the newest row by {@code updatedAt}.
     */
    PLATFORM_REGISTER_PRICE_JSON,

    /**
     * JSON array of per-tenant time-simulation entries, stored on the Platform Admin company.
     * Each entry shifts the effective clock for a single tenant for testing purposes.
     */
    PLATFORM_TIME_SIMULATION_JSON,

    /** Tenant PayPal seller onboarding and merchant configuration. */
    PAYPAL_MERCHANT_ID,
    PAYPAL_TRACKING_ID,
    PAYPAL_ONBOARDING_STATUS,

    /** Platform Stripe Connect configuration. Stored on the super-admin company and split by sandbox/production. */
    GLOBAL_STRIPE_SANDBOX_ENABLED,
    GLOBAL_STRIPE_SANDBOX_SECRET_KEY,
    GLOBAL_STRIPE_SANDBOX_PUBLISHABLE_KEY,
    GLOBAL_STRIPE_SANDBOX_WEBHOOK_SECRET,
    GLOBAL_STRIPE_SANDBOX_SUCCESS_URL,
    GLOBAL_STRIPE_SANDBOX_CANCEL_URL,
    GLOBAL_STRIPE_SANDBOX_CURRENCY,
    GLOBAL_STRIPE_SANDBOX_APPLICATION_FEE_PERCENT,
    GLOBAL_STRIPE_SANDBOX_APPLICATION_FEE_FIXED_MINOR,
    GLOBAL_STRIPE_PRODUCTION_ENABLED,
    GLOBAL_STRIPE_PRODUCTION_SECRET_KEY,
    GLOBAL_STRIPE_PRODUCTION_PUBLISHABLE_KEY,
    GLOBAL_STRIPE_PRODUCTION_WEBHOOK_SECRET,
    GLOBAL_STRIPE_PRODUCTION_SUCCESS_URL,
    GLOBAL_STRIPE_PRODUCTION_CANCEL_URL,
    GLOBAL_STRIPE_PRODUCTION_CURRENCY,
    GLOBAL_STRIPE_PRODUCTION_APPLICATION_FEE_PERCENT,
    GLOBAL_STRIPE_PRODUCTION_APPLICATION_FEE_FIXED_MINOR,

    /** Tenant Stripe Connect onboarding and connected-account status. */
    STRIPE_CONNECT_MODE,
    STRIPE_CONNECT_COUNTRY,
    STRIPE_CONNECT_BUSINESS_TYPE,
    STRIPE_SANDBOX_ACCOUNT_ID,
    STRIPE_SANDBOX_ONBOARDING_STATUS,
    STRIPE_SANDBOX_CHARGES_ENABLED,
    STRIPE_SANDBOX_PAYOUTS_ENABLED,
    STRIPE_SANDBOX_DETAILS_SUBMITTED,
    STRIPE_SANDBOX_REQUIREMENTS_JSON,
    STRIPE_PRODUCTION_ACCOUNT_ID,
    STRIPE_PRODUCTION_ONBOARDING_STATUS,
    STRIPE_PRODUCTION_CHARGES_ENABLED,
    STRIPE_PRODUCTION_PAYOUTS_ENABLED,
    STRIPE_PRODUCTION_DETAILS_SUBMITTED,
    STRIPE_PRODUCTION_REQUIREMENTS_JSON,

    /** Public widget security. */
    WIDGET_ALLOWED_ORIGINS,
    WIDGET_TURNSTILE_SITE_KEY,
    WIDGET_TURNSTILE_SECRET_KEY
}
