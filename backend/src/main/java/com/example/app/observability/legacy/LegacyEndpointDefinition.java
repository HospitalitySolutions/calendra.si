package com.example.app.observability.legacy;

/**
 * Repository-audited API routes that are retained temporarily while production callers are measured.
 *
 * <p>Do not remove a definition merely because its in-process counter is zero. Confirm the same result
 * in retained application logs or Prometheus across the agreed observation window first.</p>
 */
public enum LegacyEndpointDefinition {
    GUEST_PREVIEW_API(
            "guest-preview-api",
            "Guest preview",
            "*",
            "/api/guest/preview/**",
            "",
            "Preview data is now generated locally by the Android and iOS clients."
    ),
    SETTINGS_RESERVATION_RULES_READ(
            "settings-reservation-rules-read",
            "Settings",
            "GET",
            "/api/settings/reservation-rules",
            "/api/settings",
            "The current frontend reads TENANT_RESERVATION_RULES_JSON through the generic settings API."
    ),
    SETTINGS_RESERVATION_RULES_WRITE(
            "settings-reservation-rules-write",
            "Settings",
            "PUT",
            "/api/settings/reservation-rules",
            "/api/settings",
            "The current frontend writes TENANT_RESERVATION_RULES_JSON through the generic settings API."
    ),
    MFA_MANAGEMENT_STATUS(
            "mfa-management-status",
            "Security",
            "GET",
            "/api/auth/mfa/status",
            "/api/security/overview",
            "Passkey and recovery-code management moved to Security Center."
    ),
    MFA_MANAGEMENT_REGISTER_START(
            "mfa-management-register-start",
            "Security",
            "POST",
            "/api/auth/mfa/webauthn/register/start",
            "/api/security/passkeys/register/start",
            "Passkey registration management moved to Security Center."
    ),
    MFA_MANAGEMENT_REGISTER_FINISH(
            "mfa-management-register-finish",
            "Security",
            "POST",
            "/api/auth/mfa/webauthn/register/finish",
            "/api/security/passkeys/register/finish",
            "Passkey registration management moved to Security Center."
    ),
    MFA_MANAGEMENT_RECOVERY_REGENERATE(
            "mfa-management-recovery-regenerate",
            "Security",
            "POST",
            "/api/auth/mfa/recovery/regenerate",
            "/api/security/recovery/regenerate",
            "Recovery-code management moved to Security Center."
    ),
    MFA_MANAGEMENT_CREDENTIAL_DELETE(
            "mfa-management-credential-delete",
            "Security",
            "DELETE",
            "/api/auth/mfa/webauthn/credentials/{credentialId}",
            "/api/security/passkeys/{credentialId}",
            "Passkey management moved to Security Center."
    ),
    AUTH_SIGNUP_EMAIL_INTENT_VALIDATE(
            "auth-signup-email-intent-validate",
            "Registration",
            "GET",
            "/api/auth/signup/validate-email-intent",
            "/api/auth/signup/pending-session",
            "The current registration flow uses pending signup sessions and verification codes."
    ),
    AUTH_SIGNUP_EMAIL_INTENT_COMPLETE(
            "auth-signup-email-intent-complete",
            "Registration",
            "POST",
            "/api/auth/signup/complete-email",
            "/api/auth/verify-code",
            "The current registration flow completes signup through verification-code confirmation."
    ),
    AUTH_SIGNUP_EMAIL_INTENT_RESEND(
            "auth-signup-email-intent-resend",
            "Registration",
            "POST",
            "/api/auth/signup/resend-email-intent",
            "/api/auth/resend-code",
            "The current registration flow resends verification codes rather than email-intent links."
    ),
    AUTH_OAUTH_STATUS(
            "auth-oauth-status",
            "Authentication diagnostics",
            "GET",
            "/api/auth/oauth-status",
            "",
            "No supplied client calls this diagnostic endpoint; platform monitoring should own operational status."
    ),
    BILLING_STANDALONE_FOLIO_PDF(
            "billing-standalone-folio-pdf",
            "Billing",
            "POST",
            "/api/billing/folio/pdf",
            "/api/billing/bills/{id}/folio-pdf",
            "Current billing flows use persisted bill or open-bill preview PDF endpoints."
    ),
    INBOX_MULTIPART_SEND(
            "inbox-multipart-send",
            "Inbox",
            "POST",
            "/api/inbox/messages/with-attachments",
            "/api/inbox/clients/{clientId}/attachments",
            "Current clients pre-upload attachments and send through the normal message endpoint."
    ),
    NOTIFICATIONS_UNREAD_COUNT(
            "notifications-unread-count",
            "Notifications",
            "GET",
            "/api/notifications/unread-count",
            "/api/notifications",
            "The notification feed already includes unreadCount."
    ),
    GUEST_RECEIPT_METADATA(
            "guest-receipt-metadata",
            "Guest orders",
            "GET",
            "/api/guest/orders/{orderId}/receipt",
            "/api/guest/orders/{orderId}/receipt.pdf",
            "Current mobile clients download the receipt PDF directly."
    );

    private final String id;
    private final String category;
    private final String httpMethod;
    private final String path;
    private final String replacement;
    private final String reason;

    LegacyEndpointDefinition(
            String id,
            String category,
            String httpMethod,
            String path,
            String replacement,
            String reason
    ) {
        this.id = id;
        this.category = category;
        this.httpMethod = httpMethod;
        this.path = path;
        this.replacement = replacement;
        this.reason = reason;
    }

    public String id() {
        return id;
    }

    public String category() {
        return category;
    }

    public String httpMethod() {
        return httpMethod;
    }

    public String path() {
        return path;
    }

    public String replacement() {
        return replacement;
    }

    public String reason() {
        return reason;
    }

    public boolean hasConcreteReplacementPath() {
        return replacement != null && replacement.startsWith("/") && !replacement.contains("{");
    }
}
