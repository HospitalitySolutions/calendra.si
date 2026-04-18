package com.example.app.zoom;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.zoom")
public class ZoomConfig {
    private String clientId;
    private String clientSecret;
    private String redirectUri;
    private String frontendUrl;
    /** Optional. If blank, no scope param is sent (Zoom uses app-configured scopes). */
    private String scope;

    public String getClientId() { return clientId; }
    public void setClientId(String clientId) { this.clientId = clientId; }
    public String getClientSecret() { return clientSecret; }
    public void setClientSecret(String clientSecret) { this.clientSecret = clientSecret; }
    public String getRedirectUri() { return redirectUri; }
    public void setRedirectUri(String redirectUri) { this.redirectUri = redirectUri; }
    public String getFrontendUrl() { return frontendUrl; }
    public void setFrontendUrl(String frontendUrl) { this.frontendUrl = frontendUrl; }
    public String getScope() { return scope; }
    public void setScope(String scope) { this.scope = scope; }

    public boolean isConfigured() {
        return clientId != null && !clientId.isBlank()
            && clientSecret != null && !clientSecret.isBlank()
            && redirectUri != null && !redirectUri.isBlank();
    }
}
