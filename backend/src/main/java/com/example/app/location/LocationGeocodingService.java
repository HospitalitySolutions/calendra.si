package com.example.app.location;

import com.example.app.google.geocoding.GoogleGeocodingClient;
import java.time.Duration;
import java.time.Instant;
import java.util.LinkedHashSet;
import java.util.Objects;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Keeps tenant location coordinates in sync with the physical address entered in
 * Upravljanje računa -> Poslovni prostori.
 *
 * <p>Google Geocoding latitude/longitude values are treated as a temporary cache.
 * They are proactively refreshed before 30 days and are never used after 30 days.
 * The source address stored here is Calendra/customer data, not Google's formatted
 * address.</p>
 */
@Service
public class LocationGeocodingService {
    private static final Logger log = LoggerFactory.getLogger(LocationGeocodingService.class);
    private static final Duration PROACTIVE_REFRESH_AGE = Duration.ofDays(29);
    private static final Duration MAX_COORDINATE_AGE = Duration.ofDays(30);
    private static final Duration FAILED_RETRY_DELAY = Duration.ofHours(6);

    private final GoogleGeocodingClient geocoding;

    public LocationGeocodingService(GoogleGeocodingClient geocoding) {
        this.geocoding = geocoding;
    }

    /** Force a refresh when an administrator creates/changes a physical address. */
    public void refreshAfterAddressWrite(Location location) {
        if (location == null) return;
        String source = sourceAddress(location);
        boolean sourceChanged = !Objects.equals(normalize(location.getGeocodeSourceAddress()), normalize(source));
        if (sourceChanged) {
            // Never keep coordinates for an old address after the physical address changes.
            location.setLatitude(null);
            location.setLongitude(null);
            location.setGeocodedAt(null);
            location.setGeocodeSourceAddress(source);
            refresh(location, true);
            return;
        }
        refreshIfRequired(location);
    }

    /** Refresh missing/stale coordinates while avoiding repeated calls after failures. */
    public boolean refreshIfRequired(Location location) {
        if (location == null) return false;
        String source = sourceAddress(location);
        boolean sourceChanged = !Objects.equals(normalize(location.getGeocodeSourceAddress()), normalize(source));
        if (sourceChanged) {
            location.setLatitude(null);
            location.setLongitude(null);
            location.setGeocodedAt(null);
            location.setGeocodeSourceAddress(source);
            return refresh(location, true);
        }

        Instant now = Instant.now();
        if (hasCoordinates(location) && location.getGeocodedAt() != null
                && location.getGeocodedAt().isAfter(now.minus(PROACTIVE_REFRESH_AGE))) {
            return false;
        }
        if (location.getGeocodeLastAttemptAt() != null
                && location.getGeocodeLastAttemptAt().isAfter(now.minus(FAILED_RETRY_DELAY))) {
            return false;
        }
        return refresh(location, false);
    }

    /** Coordinates may only be used while still inside Google's 30-day cache window. */
    public boolean hasUsableCoordinates(Location location) {
        if (!hasCoordinates(location) || location.getGeocodedAt() == null) return false;
        return location.getGeocodedAt().isAfter(Instant.now().minus(MAX_COORDINATE_AGE));
    }

    public String sourceAddress(Location location) {
        if (location == null) return null;
        String city = clean(location.getCity());
        if (city == null) return null;
        LinkedHashSet<String> parts = new LinkedHashSet<>();
        add(parts, location.getAddress());
        add(parts, location.getPostalCode());
        add(parts, city);
        add(parts, location.getCountry());
        String value = String.join(", ", parts);
        return value.isBlank() ? null : value;
    }

    private boolean refresh(Location location, boolean force) {
        String source = sourceAddress(location);
        location.setGeocodeSourceAddress(source);
        if (source == null) {
            location.setLatitude(null);
            location.setLongitude(null);
            location.setGeocodedAt(null);
            location.setGeocodeStatus("INCOMPLETE_ADDRESS");
            return true;
        }

        if (!geocoding.isConfigured()) {
            location.setGeocodeStatus("NOT_CONFIGURED");
            return false;
        }

        Instant now = Instant.now();
        if (!force && location.getGeocodeLastAttemptAt() != null
                && location.getGeocodeLastAttemptAt().isAfter(now.minus(FAILED_RETRY_DELAY))) {
            return false;
        }
        location.setGeocodeLastAttemptAt(now);

        try {
            var result = geocoding.geocodeTenantAddress(source);
            if (result.isEmpty()) {
                location.setGeocodeStatus("ZERO_RESULTS");
                return true;
            }
            var value = result.get();
            location.setLatitude(value.latitude());
            location.setLongitude(value.longitude());
            location.setGeocodedAt(now);
            location.setGeocodeStatus("OK");
            return true;
        } catch (GoogleGeocodingClient.GeocodingException error) {
            location.setGeocodeStatus("ERROR");
            log.warn("Could not geocode location {} address '{}': {}",
                    location.getId(), source, error.getMessage());
            return true;
        }
    }

    private static boolean hasCoordinates(Location location) {
        if (location.getLatitude() == null || location.getLongitude() == null) return false;
        double lat = location.getLatitude();
        double lng = location.getLongitude();
        return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
    }

    private static void add(LinkedHashSet<String> parts, String raw) {
        String value = clean(raw);
        if (value != null) parts.add(value);
    }

    private static String clean(String value) {
        if (value == null) return null;
        String cleaned = value.trim().replaceAll("\\s+", " ");
        return cleaned.isBlank() ? null : cleaned;
    }

    private static String normalize(String value) {
        String clean = clean(value);
        return clean == null ? null : clean.toLowerCase(java.util.Locale.ROOT);
    }
}
