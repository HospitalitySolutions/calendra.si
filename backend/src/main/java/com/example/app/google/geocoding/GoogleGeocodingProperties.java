package com.example.app.google.geocoding;

import java.time.Duration;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

@Configuration
@ConfigurationProperties(prefix = "app.google-geocoding")
public class GoogleGeocodingProperties {
    private boolean enabled = true;
    private String apiKey;
    private String baseUrl = "https://maps.googleapis.com";
    private String language = "sl";
    private String region = "si";
    private Duration connectTimeout = Duration.ofSeconds(2);
    private Duration readTimeout = Duration.ofSeconds(4);
    private Duration searchCacheTtl = Duration.ofHours(24);
    private int searchCacheMaxEntries = 1000;
    private int maintenanceBatchSize = 100;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getApiKey() { return apiKey; }
    public void setApiKey(String apiKey) { this.apiKey = apiKey; }
    public String getBaseUrl() { return baseUrl; }
    public void setBaseUrl(String baseUrl) { this.baseUrl = baseUrl; }
    public String getLanguage() { return language; }
    public void setLanguage(String language) { this.language = language; }
    public String getRegion() { return region; }
    public void setRegion(String region) { this.region = region; }
    public Duration getConnectTimeout() { return connectTimeout; }
    public void setConnectTimeout(Duration connectTimeout) { this.connectTimeout = connectTimeout; }
    public Duration getReadTimeout() { return readTimeout; }
    public void setReadTimeout(Duration readTimeout) { this.readTimeout = readTimeout; }
    public Duration getSearchCacheTtl() { return searchCacheTtl; }
    public void setSearchCacheTtl(Duration searchCacheTtl) { this.searchCacheTtl = searchCacheTtl; }
    public int getSearchCacheMaxEntries() { return searchCacheMaxEntries; }
    public void setSearchCacheMaxEntries(int searchCacheMaxEntries) { this.searchCacheMaxEntries = searchCacheMaxEntries; }
    public int getMaintenanceBatchSize() { return maintenanceBatchSize; }
    public void setMaintenanceBatchSize(int maintenanceBatchSize) { this.maintenanceBatchSize = maintenanceBatchSize; }

    public boolean isConfigured() {
        return enabled && apiKey != null && !apiKey.isBlank();
    }

    public String effectiveBaseUrl() {
        String value = baseUrl == null || baseUrl.isBlank() ? "https://maps.googleapis.com" : baseUrl.trim();
        return value.replaceAll("/+$", "");
    }

    public Duration effectiveSearchCacheTtl() {
        if (searchCacheTtl == null || searchCacheTtl.isNegative() || searchCacheTtl.isZero()) return Duration.ofHours(24);
        return searchCacheTtl.compareTo(Duration.ofDays(29)) > 0 ? Duration.ofDays(29) : searchCacheTtl;
    }

    public int effectiveSearchCacheMaxEntries() {
        return Math.max(50, Math.min(searchCacheMaxEntries, 10_000));
    }

    public int effectiveMaintenanceBatchSize() {
        return Math.max(1, Math.min(maintenanceBatchSize, 1000));
    }
}
