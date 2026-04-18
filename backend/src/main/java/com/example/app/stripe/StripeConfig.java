package com.example.app.stripe;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public class StripeConfig {
    @Value("${app.stripe.secret-key:}")
    private String secretKey;
    @Value("${app.stripe.publishable-key:}")
    private String publishableKey;
    @Value("${app.stripe.webhook-secret:}")
    private String webhookSecret;
    @Value("${app.stripe.base-url:https://api.stripe.com}")
    private String baseUrl;
    @Value("${app.stripe.currency:eur}")
    private String currency;
    @Value("${app.stripe.success-url:}")
    private String successUrl;
    @Value("${app.stripe.cancel-url:}")
    private String cancelUrl;
    @Value("${app.stripe.webhook-url:}")
    private String webhookUrl;
    @Value("${app.stripe.eu-bank-transfer-country:NL}")
    private String euBankTransferCountry;
    @Value("${app.auth.frontend-url:}")
    private String appBaseUrl;

    public String secretKey() { return secretKey == null ? "" : secretKey.trim(); }
    public String publishableKey() { return publishableKey == null ? "" : publishableKey.trim(); }
    public String webhookSecret() { return webhookSecret == null ? "" : webhookSecret.trim(); }
    public String baseUrl() { return baseUrl == null ? "https://api.stripe.com" : baseUrl.trim(); }
    public String currency() { return currency == null || currency.isBlank() ? "eur" : currency.trim().toLowerCase(); }
    public String successUrl() { return successUrl == null ? "" : successUrl.trim(); }
    public String cancelUrl() { return cancelUrl == null ? "" : cancelUrl.trim(); }
    public String webhookUrl() { return webhookUrl == null ? "" : webhookUrl.trim(); }
    public String euBankTransferCountry() {
        String value = euBankTransferCountry == null ? "NL" : euBankTransferCountry.trim().toUpperCase();
        return value.isBlank() ? "NL" : value;
    }
    public String appBaseUrl() { return appBaseUrl == null ? "" : appBaseUrl.trim(); }
}
