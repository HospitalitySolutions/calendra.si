package com.example.app.paypal;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class PayPalConfig {
    @Value("${app.paypal.client-id:${PAYPAL_CLIENT_ID:}}")
    private String clientId;

    @Value("${app.paypal.client-secret:${PAYPAL_CLIENT_SECRET:}}")
    private String clientSecret;

    @Value("${app.paypal.base-url:${PAYPAL_BASE_URL:https://api-m.sandbox.paypal.com}}")
    private String baseUrl;

    @Value("${app.paypal.public-base-url:${APP_PAYPAL_PUBLIC_BASE_URL:}}")
    private String publicBaseUrl;

    @Value("${app.paypal.mobile-success-url:${APP_PAYPAL_MOBILE_SUCCESS_URL:calendra-guest://paypal/return?status=success}}")
    private String mobileSuccessUrl;

    @Value("${app.paypal.mobile-cancel-url:${APP_PAYPAL_MOBILE_CANCEL_URL:calendra-guest://paypal/return?status=cancelled}}")
    private String mobileCancelUrl;

    @Value("${app.paypal.brand-name:${APP_PAYPAL_BRAND_NAME:Calendra}}")
    private String brandName;

    @Value("${app.paypal.partner-attribution-id:${PAYPAL_PARTNER_ATTRIBUTION_ID:}}")
    private String partnerAttributionId;

    public String clientId() {
        return trim(clientId);
    }

    public String clientSecret() {
        return trim(clientSecret);
    }

    public String baseUrl() {
        String value = trim(baseUrl);
        return value == null || value.isBlank() ? "https://api-m.sandbox.paypal.com" : stripTrailingSlash(value);
    }

    public String publicBaseUrl() {
        return stripTrailingSlash(trim(publicBaseUrl));
    }

    public String mobileSuccessUrl() {
        String value = trim(mobileSuccessUrl);
        return value == null || value.isBlank() ? "calendra-guest://paypal/return?status=success" : value;
    }

    public String mobileCancelUrl() {
        String value = trim(mobileCancelUrl);
        return value == null || value.isBlank() ? "calendra-guest://paypal/return?status=cancelled" : value;
    }

    public String brandName() {
        String value = trim(brandName);
        return value == null || value.isBlank() ? "Calendra" : value;
    }

    public String partnerAttributionId() {
        return trim(partnerAttributionId);
    }

    public boolean isConfigured() {
        return clientId() != null && !clientId().isBlank()
                && clientSecret() != null && !clientSecret().isBlank()
                && publicBaseUrl() != null && !publicBaseUrl().isBlank();
    }

    private static String trim(String value) {
        return value == null ? null : value.trim();
    }

    private static String stripTrailingSlash(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        while (trimmed.endsWith("/")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1);
        }
        return trimmed;
    }
}
