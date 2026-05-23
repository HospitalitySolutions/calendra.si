package com.example.app.google.calendar;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.google-calendar")
public class GoogleCalendarConfig {
    private String clientId;
    private String clientSecret;
    private String redirectUri;
    private String frontendUrl;
    private String stateSecret;
    private String webhookUrl;
    private String webhookToken;
    private String tokenEncryptionSecret;
    private String timezone = "Europe/Ljubljana";
    private int todoDurationMinutes = 30;
    private int fullSyncLookbackDays = 90;
    private int fullSyncLookaheadDays = 365;
    private boolean enabled = true;

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getClientSecret() { return clientSecret; }
    public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }
    public String getRedirectUri() { return redirectUri; }
    public void setRedirectUri(String redirectUri) { this.redirectUri = redirectUri; }
    public String getFrontendUrl() { return frontendUrl; }
    public void setFrontendUrl(String frontendUrl) { this.frontendUrl = frontendUrl; }
    public String getStateSecret() { return stateSecret; }
    public void setStateSecret(String stateSecret) { this.stateSecret = stateSecret; }
    public String getWebhookUrl() { return webhookUrl; }
    public void setWebhookUrl(String webhookUrl) { this.webhookUrl = webhookUrl; }
    public String getWebhookToken() { return webhookToken; }
    public void setWebhookToken(String webhookToken) { this.webhookToken = webhookToken; }
    public String getTokenEncryptionSecret() { return tokenEncryptionSecret; }
    public void setTokenEncryptionSecret(String tokenEncryptionSecret) { this.tokenEncryptionSecret = tokenEncryptionSecret; }
    public String getTimezone() { return timezone; }
    public void setTimezone(String timezone) { this.timezone = timezone == null || timezone.isBlank() ? "Europe/Ljubljana" : timezone.trim(); }
    public int getTodoDurationMinutes() { return todoDurationMinutes; }
    public void setTodoDurationMinutes(int todoDurationMinutes) { this.todoDurationMinutes = Math.max(5, todoDurationMinutes); }
    public int getFullSyncLookbackDays() { return fullSyncLookbackDays; }
    public void setFullSyncLookbackDays(int fullSyncLookbackDays) { this.fullSyncLookbackDays = Math.max(1, fullSyncLookbackDays); }
    public int getFullSyncLookaheadDays() { return fullSyncLookaheadDays; }
    public void setFullSyncLookaheadDays(int fullSyncLookaheadDays) { this.fullSyncLookaheadDays = Math.max(1, fullSyncLookaheadDays); }
    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }

    public boolean isConfigured() {
        return enabled
                && clientId != null && !clientId.isBlank()
                && clientSecret != null && !clientSecret.isBlank()
                && redirectUri != null && !redirectUri.isBlank();
    }

    public String effectiveFrontendUrl() {
        return frontendUrl != null && !frontendUrl.isBlank() ? frontendUrl.trim() : "http://localhost:5173";
    }

    /**
     * Dedicated token encryption secret wins. Falling back to the OAuth state secret keeps local/staging
     * setup simple while still avoiding plaintext token storage when any stable app secret is configured.
     */
    public String effectiveTokenEncryptionSecret() {
        if (tokenEncryptionSecret != null && !tokenEncryptionSecret.isBlank()) return tokenEncryptionSecret.trim();
        return stateSecret != null && !stateSecret.isBlank() ? stateSecret.trim() : null;
    }
}
