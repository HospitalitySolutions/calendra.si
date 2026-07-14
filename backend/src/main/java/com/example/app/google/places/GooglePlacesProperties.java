package com.example.app.google.places;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.google-places")
public class GooglePlacesProperties {
    private boolean enabled = true;
    private boolean automaticTextSearchEnabled = true;
    private String apiKey;
    private String baseUrl = "https://places.googleapis.com";
    private String languageCode = "sl";
    private String regionCode = "SI";
    private Duration connectTimeout = Duration.ofSeconds(2);
    private Duration readTimeout = Duration.ofSeconds(3);
    private int maxConcurrentLookups = 6;

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public boolean isAutomaticTextSearchEnabled() {
        return automaticTextSearchEnabled;
    }

    public void setAutomaticTextSearchEnabled(boolean automaticTextSearchEnabled) {
        this.automaticTextSearchEnabled = automaticTextSearchEnabled;
    }

    public String getApiKey() {
        return apiKey;
    }

    public void setApiKey(String apiKey) {
        this.apiKey = apiKey;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getLanguageCode() {
        return languageCode;
    }

    public void setLanguageCode(String languageCode) {
        this.languageCode = languageCode;
    }

    public String getRegionCode() {
        return regionCode;
    }

    public void setRegionCode(String regionCode) {
        this.regionCode = regionCode;
    }

    public Duration getConnectTimeout() {
        return connectTimeout;
    }

    public void setConnectTimeout(Duration connectTimeout) {
        this.connectTimeout = connectTimeout;
    }

    public Duration getReadTimeout() {
        return readTimeout;
    }

    public void setReadTimeout(Duration readTimeout) {
        this.readTimeout = readTimeout;
    }

    public int getMaxConcurrentLookups() {
        return maxConcurrentLookups;
    }

    public void setMaxConcurrentLookups(int maxConcurrentLookups) {
        this.maxConcurrentLookups = maxConcurrentLookups;
    }

    public boolean isConfigured() {
        return enabled && apiKey != null && !apiKey.isBlank();
    }

    public String effectiveBaseUrl() {
        String value = baseUrl == null || baseUrl.isBlank()
                ? "https://places.googleapis.com"
                : baseUrl.trim();
        return value.replaceAll("/+$", "");
    }

    public int effectiveMaxConcurrentLookups() {
        return Math.max(1, Math.min(maxConcurrentLookups, 20));
    }
}
