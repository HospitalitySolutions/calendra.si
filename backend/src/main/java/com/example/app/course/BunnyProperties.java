package com.example.app.course;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app.bunny")
public record BunnyProperties(
        String apiKey,
        String streamBaseUrl,
        String storageZone,
        String storagePassword,
        String storageRegionHost,
        String audioCdnHost,
        boolean enabled
) {
    public String effectiveStreamBaseUrl() {
        return hasText(streamBaseUrl) ? trimSlash(streamBaseUrl) : "https://video.bunnycdn.com";
    }

    public String effectiveStorageRegionHost() {
        return hasText(storageRegionHost) ? trimSlash(storageRegionHost) : "https://storage.bunnycdn.com";
    }

    public boolean hasStreamApiKey() {
        return hasText(apiKey);
    }

    public boolean hasAudioStorage() {
        return hasText(storageZone) && hasText(storagePassword);
    }

    private static boolean hasText(String value) {
        return value != null && !value.trim().isBlank();
    }

    private static String trimSlash(String value) {
        String v = value.trim();
        while (v.endsWith("/")) v = v.substring(0, v.length() - 1);
        return v;
    }
}
