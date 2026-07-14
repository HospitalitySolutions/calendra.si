package com.example.app.google.places;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.client.RestClientResponseException;

@Component
public class GooglePlacesClient {
    private static final Logger log = LoggerFactory.getLogger(GooglePlacesClient.class);
    private static final String API_KEY_HEADER = "X-Goog-Api-Key";
    private static final String FIELD_MASK_HEADER = "X-Goog-FieldMask";
    private static final String DETAILS_FIELD_MASK = "rating,userRatingCount,googleMapsUri";
    private static final String SEARCH_FIELD_MASK = "places.id,places.rating,places.userRatingCount,places.googleMapsUri";

    private final GooglePlacesProperties properties;
    private final RestClient restClient;

    @Autowired
    public GooglePlacesClient(GooglePlacesProperties properties, RestClient.Builder restClientBuilder) {
        this(properties, createRestClient(properties, restClientBuilder));
    }

    GooglePlacesClient(GooglePlacesProperties properties, RestClient restClient) {
        this.properties = properties;
        this.restClient = restClient;
    }

    private static RestClient createRestClient(
            GooglePlacesProperties properties,
            RestClient.Builder restClientBuilder
    ) {
        SimpleClientHttpRequestFactory requestFactory = new SimpleClientHttpRequestFactory();
        requestFactory.setConnectTimeout(properties.getConnectTimeout());
        requestFactory.setReadTimeout(properties.getReadTimeout());
        return restClientBuilder.requestFactory(requestFactory).build();
    }

    public boolean isConfigured() {
        return properties.isConfigured();
    }

    public Optional<PlaceReviewSummary> lookup(String placeId, String publicName, String fullAddress) {
        if (!properties.isConfigured()) {
            return Optional.empty();
        }

        String normalizedPlaceId = trimToNull(placeId);
        if (normalizedPlaceId != null) {
            return details(normalizedPlaceId);
        }
        if (!properties.isAutomaticTextSearchEnabled()) {
            return Optional.empty();
        }

        String query = joinQuery(publicName, fullAddress);
        if (query.isBlank()) {
            return Optional.empty();
        }
        return textSearch(query);
    }

    private Optional<PlaceReviewSummary> details(String placeId) {
        try {
            JsonNode place = restClient.get()
                    .uri(properties.effectiveBaseUrl() + "/v1/places/{placeId}", placeId)
                    .accept(MediaType.APPLICATION_JSON)
                    .header(API_KEY_HEADER, properties.getApiKey().trim())
                    .header(FIELD_MASK_HEADER, DETAILS_FIELD_MASK)
                    .retrieve()
                    .body(JsonNode.class);
            return parsePlace(place, placeId);
        } catch (RestClientResponseException ex) {
            logLookupFailure("details", ex);
            return Optional.empty();
        } catch (RestClientException ex) {
            log.warn("Google Places details lookup failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    private Optional<PlaceReviewSummary> textSearch(String query) {
        try {
            Map<String, Object> request = new LinkedHashMap<>();
            request.put("textQuery", query);
            request.put("pageSize", 1);
            putIfText(request, "languageCode", properties.getLanguageCode());
            putIfText(request, "regionCode", properties.getRegionCode());

            JsonNode response = restClient.post()
                    .uri(properties.effectiveBaseUrl() + "/v1/places:searchText")
                    .contentType(MediaType.APPLICATION_JSON)
                    .accept(MediaType.APPLICATION_JSON)
                    .header(API_KEY_HEADER, properties.getApiKey().trim())
                    .header(FIELD_MASK_HEADER, SEARCH_FIELD_MASK)
                    .body(request)
                    .retrieve()
                    .body(JsonNode.class);

            JsonNode places = response == null ? null : response.path("places");
            if (places == null || !places.isArray() || places.isEmpty()) {
                return Optional.empty();
            }
            JsonNode first = places.get(0);
            return parsePlace(first, text(first == null ? null : first.path("id")));
        } catch (RestClientResponseException ex) {
            logLookupFailure("text search", ex);
            return Optional.empty();
        } catch (RestClientException ex) {
            log.warn("Google Places text search failed: {}", ex.getMessage());
            return Optional.empty();
        }
    }

    private static Optional<PlaceReviewSummary> parsePlace(JsonNode place, String fallbackPlaceId) {
        if (place == null || place.isMissingNode() || place.isNull()) {
            return Optional.empty();
        }
        Double rating = place.path("rating").isNumber() ? place.path("rating").doubleValue() : null;
        Long reviewCount = place.path("userRatingCount").isIntegralNumber()
                ? place.path("userRatingCount").longValue()
                : null;
        String mapsUri = text(place.path("googleMapsUri"));
        String resolvedPlaceId = firstNonBlank(text(place.path("id")), fallbackPlaceId);

        if (rating == null && reviewCount == null && mapsUri == null && resolvedPlaceId == null) {
            return Optional.empty();
        }
        return Optional.of(new PlaceReviewSummary(rating, reviewCount, mapsUri, resolvedPlaceId));
    }

    private static void putIfText(Map<String, Object> request, String key, String value) {
        String normalized = trimToNull(value);
        if (normalized != null) {
            request.put(key, normalized);
        }
    }

    private static String joinQuery(String name, String address) {
        String normalizedName = trimToNull(name);
        String normalizedAddress = trimToNull(address);
        if (normalizedName == null || normalizedAddress == null) return "";
        return normalizedName + ", " + normalizedAddress;
    }

    private static String text(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        return trimToNull(node.asText(null));
    }

    private static String firstNonBlank(String... values) {
        for (String value : values) {
            String normalized = trimToNull(value);
            if (normalized != null) return normalized;
        }
        return null;
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String normalized = value.trim();
        return normalized.isBlank() ? null : normalized;
    }

    private static void logLookupFailure(String operation, RestClientResponseException ex) {
        String body = ex.getResponseBodyAsString();
        if (body != null && body.length() > 240) {
            body = body.substring(0, 240) + "…";
        }
        log.warn("Google Places {} failed with HTTP {}: {}", operation, ex.getStatusCode().value(), body);
    }

    public record PlaceReviewSummary(
            Double rating,
            Long reviewCount,
            String googleMapsUri,
            String placeId
    ) {}
}
