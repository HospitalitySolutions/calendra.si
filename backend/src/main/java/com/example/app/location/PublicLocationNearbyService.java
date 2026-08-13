package com.example.app.location;

import com.example.app.google.geocoding.GoogleGeocodingClient;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class PublicLocationNearbyService {
    private static final int DEFAULT_LIMIT = 50;
    private static final int MAX_LIMIT = 100;
    private static final double MAX_RADIUS_KM = 500.0;

    private final LocationRepository locations;
    private final LocationGeocodingService locationGeocoding;
    private final GoogleGeocodingClient googleGeocoding;
    private final PublicLocationDirectoryService directory;

    public PublicLocationNearbyService(
            LocationRepository locations,
            LocationGeocodingService locationGeocoding,
            GoogleGeocodingClient googleGeocoding,
            PublicLocationDirectoryService directory
    ) {
        this.locations = locations;
        this.locationGeocoding = locationGeocoding;
        this.googleGeocoding = googleGeocoding;
        this.directory = directory;
    }

    public NearbySearchResponse search(String rawAddress, Double radiusKm, Integer rawLimit) {
        String address = normalizeSearchAddress(rawAddress);
        if (!googleGeocoding.isConfigured()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Location search is temporarily unavailable because geocoding is not configured.");
        }

        GoogleGeocodingClient.GeocodeResult origin;
        try {
            origin = googleGeocoding.geocodeSearch(address)
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Lokacije ni bilo mogoče najti. Poskusite vnesti bolj natančen naslov ali kraj."));
        } catch (GoogleGeocodingClient.GeocodingException error) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "Iskanje po lokaciji trenutno ni na voljo. Poskusite znova čez nekaj trenutkov.", error);
        }

        double radius = normalizeRadius(radiusKm);
        int limit = normalizeLimit(rawLimit);

        List<Location> publicLocations = locations.findAllByActiveTrueAndPublicDirectoryEnabledTrueOrderByCompanyIdAscNameAscIdAsc();
        // Existing tenants are normally backfilled by the scheduled maintenance job. Keep
        // the request path bounded: only recover a few missing/expired coordinates here.
        int lazyRefreshBudget = 8;
        for (Location location : publicLocations) {
            if (locationGeocoding.hasUsableCoordinates(location) || lazyRefreshBudget <= 0) continue;
            if (locationGeocoding.refreshIfRequired(location)) {
                locations.save(location);
                lazyRefreshBudget--;
            }
        }

        Map<Long, Location> usableById = publicLocations.stream()
                .filter(locationGeocoding::hasUsableCoordinates)
                .collect(Collectors.toMap(Location::getId, value -> value, (a, b) -> a, LinkedHashMap::new));

        Map<Long, PublicLocationDirectoryService.DirectoryLocationResponse> directoryById = directory.list().stream()
                .filter(PublicLocationDirectoryService.DirectoryLocationResponse::publicBookingEnabled)
                .collect(Collectors.toMap(
                        PublicLocationDirectoryService.DirectoryLocationResponse::locationId,
                        value -> value,
                        (a, b) -> a,
                        LinkedHashMap::new
                ));

        List<NearbyLocationResponse> items = new ArrayList<>();
        for (Map.Entry<Long, Location> entry : usableById.entrySet()) {
            var publicLocation = directoryById.get(entry.getKey());
            if (publicLocation == null) continue;
            Location location = entry.getValue();
            double distance = haversineKm(origin.latitude(), origin.longitude(), location.getLatitude(), location.getLongitude());
            if (!Double.isNaN(radius) && distance > radius) continue;
            items.add(new NearbyLocationResponse(publicLocation, roundDistance(distance)));
        }

        items.sort(Comparator
                .comparingDouble(NearbyLocationResponse::distanceKm)
                .thenComparing(item -> item.location().publicName(), String.CASE_INSENSITIVE_ORDER)
                .thenComparing(item -> item.location().locationId()));
        if (items.size() > limit) items = new ArrayList<>(items.subList(0, limit));

        return new NearbySearchResponse(address, "Google Maps", items);
    }

    private static String normalizeSearchAddress(String raw) {
        if (raw == null) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Kje? je obvezen podatek.");
        String value = raw.trim().replaceAll("\\s+", " ");
        if (value.length() < 2) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Vnesite kraj ali naslov.");
        if (value.length() > 300) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Lokacija je predolga.");
        return value;
    }

    private static double normalizeRadius(Double raw) {
        if (raw == null) return Double.NaN;
        if (!Double.isFinite(raw) || raw <= 0 || raw > MAX_RADIUS_KM) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "radiusKm mora biti med 0 in 500 km.");
        }
        return raw;
    }

    private static int normalizeLimit(Integer raw) {
        if (raw == null) return DEFAULT_LIMIT;
        return Math.max(1, Math.min(raw, MAX_LIMIT));
    }

    static double haversineKm(double lat1, double lng1, double lat2, double lng2) {
        double earthRadiusKm = 6371.0088;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    private static double roundDistance(double km) {
        return Math.round(km * 10.0) / 10.0;
    }

    public record NearbySearchResponse(String query, String attribution, List<NearbyLocationResponse> items) {}
    public record NearbyLocationResponse(PublicLocationDirectoryService.DirectoryLocationResponse location, double distanceKm) {}
}
