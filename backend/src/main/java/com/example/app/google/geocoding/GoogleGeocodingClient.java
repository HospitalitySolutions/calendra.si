package com.example.app.google.geocoding;

import com.fasterxml.jackson.databind.JsonNode;
import java.time.Instant;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Small server-side client for Google Geocoding API v3.
 *
 * <p>Only customer-entered search queries are cached here, and only for a short TTL.
 * Persisted tenant coordinates are managed separately by LocationGeocodingService so
 * their 30-day Google Maps Platform caching limit can be enforced explicitly.</p>
 */
@Component
public class GoogleGeocodingClient {
    private static final Logger log = LoggerFactory.getLogger(GoogleGeocodingClient.class);

    private final GoogleGeocodingProperties properties;
    private final RestClient restClient;
    private final Map<String, CachedGeocode> searchCache = new ConcurrentHashMap<>();

    @Autowired
    public GoogleGeocodingClient(GoogleGeocodingProperties properties, RestClient.Builder builder) {
        this(properties, createClient(properties, builder));
    }

    GoogleGeocodingClient(GoogleGeocodingProperties properties, RestClient restClient) {
        this.properties = properties;
        this.restClient = restClient;
    }

    private static RestClient createClient(GoogleGeocodingProperties properties, RestClient.Builder builder) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getConnectTimeout());
        requestFactory.setReadTimeout(properties.getReadTimeout());
        return builder
                .baseUrl(properties.effectiveBaseUrl())
                .requestFactory(requestFactory)
                .build();
    }

    public boolean isConfigured() {
        return properties.isConfigured();
    }

    /** Geocode a customer-entered search string using a bounded in-memory cache. */
    public Optional<GeocodeResult> geocodeSearch(String address) {
        String normalized = normalize(address);
        if (normalized == null || !properties.isConfigured()) return Optional.empty();

        Instant now = Instant.now();
        CachedGeocode cached = searchCache.get(normalized);
        if (cached != null && cached.expiresAt().isAfter(now)) {
            return Optional.of(cached.result());
        }
        if (cached != null) searchCache.remove(normalized, cached);

        Optional<GeocodeResult> result = geocodeUncached(address);
        result.ifPresent(value -> {
            if (searchCache.size() >= properties.effectiveSearchCacheMaxEntries()) {
                evictExpiredOrOldest(now);
            }
            searchCache.put(normalized, new CachedGeocode(value, now.plus(properties.effectiveSearchCacheTtl())));
        });
        return result;
    }

    /** Geocode a tenant address without the customer-search cache. */
    public Optional<GeocodeResult> geocodeTenantAddress(String address) {
        if (!properties.isConfigured() || normalize(address) == null) return Optional.empty();
        return geocodeUncached(address);
    }

    private Optional<GeocodeResult> geocodeUncached(String address) {
        try {
            JsonNode response = restClient.get()
                    .uri(uri -> {
                        var builder = uri.path("/maps/api/geocode/json")
                                .queryParam("address", address)
                                .queryParam("key", properties.getApiKey().trim());
                        if (properties.getLanguage() != null && !properties.getLanguage().isBlank()) {
                            builder.queryParam("language", properties.getLanguage().trim());
                        }
                        if (properties.getRegion() != null && !properties.getRegion().isBlank()) {
                            builder.queryParam("region", properties.getRegion().trim());
                        }
                        return builder.build();
                    })
                    .retrieve()
                    .body(JsonNode.class);

            if (response == null) return Optional.empty();
            String status = response.path("status").asText("");
            if ("ZERO_RESULTS".equals(status)) return Optional.empty();
            if (!"OK".equals(status)) {
                String message = response.path("error_message").asText("");
                log.warn("Google Geocoding request failed with status {}{}", status,
                        message.isBlank() ? "" : ": " + message);
                throw new GeocodingException("Google Geocoding returned " + status);
            }

            JsonNode first = response.path("results").path(0);
            JsonNode location = first.path("geometry").path("location");
            if (!location.hasNonNull("lat") || !location.hasNonNull("lng")) return Optional.empty();

            return Optional.of(new GeocodeResult(
                    location.path("lat").asDouble(),
                    location.path("lng").asDouble(),
                    text(first.path("formatted_address")),
                    text(first.path("place_id"))
            ));
        } catch (GeocodingException ex) {
            throw ex;
        } catch (RestClientException ex) {
            log.warn("Google Geocoding HTTP request failed: {}", ex.getMessage());
            throw new GeocodingException("Google Geocoding request failed", ex);
        }
    }

    private void evictExpiredOrOldest(Instant now) {
        searchCache.entrySet().removeIf(entry -> entry.getValue().expiresAt().isBefore(now));
        if (searchCache.size() < properties.effectiveSearchCacheMaxEntries()) return;
        searchCache.entrySet().stream()
                .min((a, b) -> a.getValue().expiresAt().compareTo(b.getValue().expiresAt()))
                .ifPresent(entry -> searchCache.remove(entry.getKey(), entry.getValue()));
    }

    private static String normalize(String value) {
        if (value == null) return null;
        String normalized = value.trim().replaceAll("\\s+", " ").toLowerCase(Locale.ROOT);
        return normalized.isBlank() ? null : normalized;
    }

    private static String text(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        String value = node.asText("").trim();
        return value.isBlank() ? null : value;
    }

    private record CachedGeocode(GeocodeResult result, Instant expiresAt) {}

    public record GeocodeResult(double latitude, double longitude, String formattedAddress, String placeId) {}

    public static class GeocodingException extends RuntimeException {
        public GeocodingException(String message) { super(message); }
        public GeocodingException(String message, Throwable cause) { super(message, cause); }
    }
}
