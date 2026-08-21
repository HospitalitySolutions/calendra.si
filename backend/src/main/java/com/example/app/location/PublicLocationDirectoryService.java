package com.example.app.location;

import com.example.app.company.Company;
import com.example.app.google.places.GooglePlacesClient;
import com.example.app.google.places.GooglePlacesProperties;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.settings.TenantConfigTypeCatalog;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PreDestroy;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PublicLocationDirectoryService {
    private static final Logger log = LoggerFactory.getLogger(PublicLocationDirectoryService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> DIRECTORY_SETTING_KEYS = Set.of(
            SettingKey.GUEST_APP_SETTINGS_JSON.name(),
            SettingKey.MODULE_CONFIG_TYPE.name(),
            SettingKey.COMPANY_LOGO_URL.name(),
            SettingKey.TENANCY_ACCESS_STATUS.name()
    );

    private final LocationRepository locations;
    private final AppSettingRepository settings;
    private final LocationPublicPresentationService presentationService;
    private final GooglePlacesClient googlePlaces;
    private final ExecutorService googleLookupExecutor;

    public PublicLocationDirectoryService(
            LocationRepository locations,
            AppSettingRepository settings,
            LocationPublicPresentationService presentationService,
            GooglePlacesClient googlePlaces,
            GooglePlacesProperties googlePlacesProperties
    ) {
        this.locations = locations;
        this.settings = settings;
        this.presentationService = presentationService;
        this.googlePlaces = googlePlaces;
        this.googleLookupExecutor = Executors.newFixedThreadPool(
                googlePlacesProperties.effectiveMaxConcurrentLookups(),
                Thread.ofPlatform().daemon(true).name("google-places-location-directory-", 0).factory()
        );
    }

    @Transactional(readOnly = true)
    public Optional<DirectoryLocationResponse> findBySlug(String slug) {
        String normalizedSlug = slug == null ? "" : slug.trim().toLowerCase(Locale.ROOT);
        Long locationId = locationIdFromSlug(normalizedSlug);
        if (locationId == null) return Optional.empty();

        Location location = locations.findById(locationId).orElse(null);
        if (location == null || !location.isActive() || !location.isPublicDirectoryEnabled()) {
            return Optional.empty();
        }

        Company company = location.getCompany();
        if (company == null || company.getId() == null) return Optional.empty();

        Map<String, String> values = settings.findAllByCompanyIdsAndKeys(
                        List.of(company.getId()),
                        DIRECTORY_SETTING_KEYS
                ).stream()
                .collect(Collectors.toMap(AppSetting::getKey, AppSetting::getValue, (a, b) -> b, LinkedHashMap::new));

        DirectoryDraft draft = toDraft(location, values);
        if (draft == null || !draft.slug().equals(normalizedSlug)) return Optional.empty();

        if (!googlePlaces.isConfigured()) {
            return Optional.of(draft.toResponse(null, null, fallbackMapsUrl(draft.displayAddress()), null, null));
        }

        try {
            return Optional.of(enrichWithGoogle(draft));
        } catch (Exception error) {
            log.warn(
                    "Could not enrich public directory location {} (tenant {}) with Google Places data.",
                    draft.locationId(), draft.tenantSlug(), error
            );
            return Optional.of(draft.toResponse(null, null, fallbackMapsUrl(draft.displayAddress()), null, null));
        }
    }

    @Transactional(readOnly = true)
    public List<DirectoryLocationResponse> list() {
        List<Location> publicLocations = locations.findAllByActiveTrueAndPublicDirectoryEnabledTrueOrderByCompanyIdAscNameAscIdAsc();
        if (publicLocations.isEmpty()) {
            return List.of();
        }

        LinkedHashSet<Long> companyIds = publicLocations.stream()
                .map(Location::getCompany)
                .filter(company -> company != null && company.getId() != null)
                .map(Company::getId)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        if (companyIds.isEmpty()) {
            return List.of();
        }

        Map<Long, Map<String, String>> valuesByCompany = settings.findAllByCompanyIdsAndKeys(
                        companyIds,
                        DIRECTORY_SETTING_KEYS
                ).stream()
                .filter(row -> row.getCompany() != null && row.getCompany().getId() != null)
                .collect(Collectors.groupingBy(
                        row -> row.getCompany().getId(),
                        LinkedHashMap::new,
                        Collectors.toMap(AppSetting::getKey, AppSetting::getValue, (a, b) -> b, LinkedHashMap::new)
                ));

        List<DirectoryDraft> drafts = new ArrayList<>();
        for (Location location : publicLocations) {
            Company company = location.getCompany();
            if (company == null || company.getId() == null) continue;
            Map<String, String> values = valuesByCompany.getOrDefault(company.getId(), Map.of());
            DirectoryDraft draft = toDraft(location, values);
            if (draft != null) drafts.add(draft);
        }

        List<DirectoryLocationResponse> result;
        if (googlePlaces.isConfigured()) {
            List<CompletableFuture<DirectoryLocationResponse>> lookups = drafts.stream()
                    .map(draft -> CompletableFuture
                            .supplyAsync(() -> enrichWithGoogle(draft), googleLookupExecutor)
                            .exceptionally(error -> {
                                log.warn(
                                        "Could not enrich public directory location {} (tenant {}) with Google Places data.",
                                        draft.locationId(), draft.tenantSlug(), error
                                );
                                return draft.toResponse(null, null, fallbackMapsUrl(draft.displayAddress()), null, null);
                            }))
                    .toList();
            result = lookups.stream()
                    .map(CompletableFuture::join)
                    .collect(Collectors.toCollection(ArrayList::new));
        } else {
            result = drafts.stream()
                    .map(draft -> draft.toResponse(null, null, fallbackMapsUrl(draft.displayAddress()), null, null))
                    .collect(Collectors.toCollection(ArrayList::new));
        }

        result.sort(Comparator
                .comparing(DirectoryLocationResponse::publicName, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(DirectoryLocationResponse::locationId));
        return result;
    }

    /**
     * Resolve a visitor-entered address/place in Slovenia and return public tenant locations
     * ordered by straight-line distance. Only locations that are already opted into the public
     * directory are considered.
     */
    @Transactional(readOnly = true)
    public NearbySearchResponse searchNearby(String rawAddress, Double radiusKm, int limit) {
        String address = rawAddress == null ? "" : rawAddress.trim();
        if (address.isBlank()) {
            throw new IllegalArgumentException("Address is required.");
        }
        if (!googlePlaces.isConfigured()) {
            throw new IllegalStateException("Nearby location search is not configured.");
        }

        Double effectiveRadiusKm = radiusKm == null || radiusKm <= 0d ? null : Math.max(1d, Math.min(radiusKm, 200d));
        int effectiveLimit = Math.max(1, Math.min(limit, 100));
        String query = ensureSlovenia(address);

        GooglePlacesClient.GeocodedPlace center = googlePlaces.geocode(query)
                .orElseThrow(() -> new IllegalArgumentException("Address could not be resolved."));

        List<DirectoryLocationResponse> matches = list().stream()
                .filter(location -> location.latitude() != null && location.longitude() != null)
                .map(location -> location.withDistance(haversineKm(
                        center.latitude(),
                        center.longitude(),
                        location.latitude(),
                        location.longitude()
                )))
                .filter(location -> effectiveRadiusKm == null || location.distanceKm() <= effectiveRadiusKm)
                .sorted(Comparator
                        .comparing(DirectoryLocationResponse::distanceKm)
                        .thenComparing(DirectoryLocationResponse::publicName, String.CASE_INSENSITIVE_ORDER)
                        .thenComparing(DirectoryLocationResponse::locationId))
                .limit(effectiveLimit)
                .toList();

        return new NearbySearchResponse(
                address,
                firstNonBlank(center.formattedAddress(), address),
                center.latitude(),
                center.longitude(),
                effectiveRadiusKm,
                matches
        );
    }

    private static double haversineKm(double lat1, double lon1, double lat2, double lon2) {
        double earthRadiusKm = 6371.0088d;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLon = Math.toRadians(lon2 - lon1);
        double a = Math.sin(dLat / 2d) * Math.sin(dLat / 2d)
                + Math.cos(Math.toRadians(lat1))
                * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLon / 2d)
                * Math.sin(dLon / 2d);
        return earthRadiusKm * 2d * Math.atan2(Math.sqrt(a), Math.sqrt(1d - a));
    }

    private static String ensureSlovenia(String address) {
        String normalized = address.toLowerCase(Locale.ROOT);
        if (normalized.contains("slovenia") || normalized.contains("slovenija")) {
            return address;
        }
        return address + ", Slovenia";
    }

    private DirectoryLocationResponse enrichWithGoogle(DirectoryDraft draft) {
        GooglePlacesClient.PlaceReviewSummary google = googlePlaces
                .lookup(draft.googlePlaceId(), draft.publicName(), draft.googleQueryAddress())
                .orElse(null);

        Double latitude = google == null ? null : google.latitude();
        Double longitude = google == null ? null : google.longitude();

        // A tenant does not need a Google Business Profile to be searchable by proximity.
        // If the business lookup has no coordinates, geocode the physical address stored under
        // Upravljanje računa -> Poslovni prostori.
        if ((latitude == null || longitude == null) && !draft.physicalQueryAddress().isBlank()) {
            GooglePlacesClient.GeocodedPlace geocoded = googlePlaces
                    .geocode(draft.physicalQueryAddress())
                    .orElse(null);
            if (geocoded != null) {
                latitude = geocoded.latitude();
                longitude = geocoded.longitude();
            }
        }

        Double rating = google == null ? null : google.rating();
        Long reviewCount = google == null ? null : google.reviewCount();
        String mapsUri = firstNonBlank(
                google == null ? null : google.googleMapsUri(),
                fallbackMapsUrl(draft.displayAddress())
        );
        return draft.toResponse(rating, reviewCount, mapsUri, latitude, longitude);
    }

    private DirectoryDraft toDraft(Location location, Map<String, String> values) {
        String accessStatus = firstNonBlank(values.get(SettingKey.TENANCY_ACCESS_STATUS.name()));
        if ("SUSPENDED".equalsIgnoreCase(accessStatus) || "CANCELLED".equalsIgnoreCase(accessStatus)) {
            return null;
        }

        Company company = location.getCompany();
        String companyLogoUrl = firstNonBlank(values.get(SettingKey.COMPANY_LOGO_URL.name()));
        LocationPublicPresentationService.PublicPresentation presentation = presentationService.resolve(location, companyLogoUrl);
        if (presentation == null || !presentation.active() || !presentation.publicDirectoryEnabled()) {
            return null;
        }

        JsonNode guest = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        String tenantBusinessType = TenantConfigTypeCatalog.normalizeOrDefault(firstNonBlank(
                values.get(SettingKey.MODULE_CONFIG_TYPE.name()),
                text(guest.path("tenantType"))
        ));
        String category = TenantConfigTypeCatalog.normalizeOrNull(location.getPublicBusinessType());
        if (category == null) category = tenantBusinessType;
        String tenantSlug = firstNonBlank(company.getTenantCode(), String.valueOf(company.getId()));
        String slug = slugify(tenantSlug) + "-" + location.getId();
        String displayAddress = emptyIfNull(presentation.publicAddress());
        String physicalStreet = firstNonBlank(location.getAddress());
        String physicalPostalCode = firstNonBlank(location.getPostalCode());
        String physicalCity = firstNonBlank(location.getCity());
        String physicalQueryAddress = physicalStreet == null && physicalPostalCode == null && physicalCity == null
                ? ""
                : joinNonBlank(physicalStreet, physicalPostalCode, physicalCity, location.getCountry());
        String googleQueryAddress = firstNonBlank(
                physicalQueryAddress,
                joinNonBlank(displayAddress, location.getCountry())
        );
        if (googleQueryAddress == null) googleQueryAddress = "";
        String bookingUrl = presentation.publicBookingEnabled()
                ? "/narocanje/" + urlPathSegment(tenantSlug) + "?locationId=" + location.getId()
                : "";

        return new DirectoryDraft(
                location.getId(),
                slug,
                tenantSlug,
                presentation.publicName(),
                emptyIfNull(presentation.publicDescription()),
                emptyIfNull(presentation.publicLogoUrl()),
                new PhysicalAddressResponse(
                        emptyIfNull(location.getAddress()),
                        emptyIfNull(location.getPostalCode()),
                        emptyIfNull(location.getCity()),
                        emptyIfNull(location.getCountry())
                ),
                displayAddress,
                googleQueryAddress,
                physicalQueryAddress,
                emptyIfNull(presentation.publicPhone()),
                category,
                presentation.publicBookingEnabled(),
                bookingUrl,
                presentation.googlePlaceId()
        );
    }

    private static Long locationIdFromSlug(String slug) {
        if (slug == null || slug.isBlank()) return null;
        int separator = slug.lastIndexOf('-');
        if (separator < 0 || separator == slug.length() - 1) return null;
        try {
            long value = Long.parseLong(slug.substring(separator + 1));
            return value > 0 ? value : null;
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static String fallbackMapsUrl(String address) {
        if (address == null || address.isBlank()) return "";
        String encoded = URLEncoder.encode(address, StandardCharsets.UTF_8).replace("+", "%20");
        return "https://www.google.com/maps/search/?api=1&query=" + encoded;
    }

    private static String urlPathSegment(String value) {
        return URLEncoder.encode(emptyIfNull(value), StandardCharsets.UTF_8).replace("+", "%20");
    }

    private static JsonNode parse(String raw) {
        if (raw == null || raw.isBlank()) return JSON.createObjectNode();
        try {
            return JSON.readTree(raw);
        } catch (Exception ignored) {
            return JSON.createObjectNode();
        }
    }

    private static String text(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        String value = node.asText("").trim();
        return value.isBlank() ? null : value;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) return value.trim();
        }
        return null;
    }

    private static String emptyIfNull(String value) {
        return value == null ? "" : value;
    }

    private static String joinNonBlank(String... values) {
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        if (values != null) {
            for (String value : values) {
                if (value != null && !value.isBlank()) normalized.add(value.trim());
            }
        }
        return String.join(", ", normalized);
    }

    private static String slugify(String value) {
        String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        return normalized.isBlank() ? "location" : normalized;
    }

    @PreDestroy
    void shutdownGoogleLookupExecutor() {
        googleLookupExecutor.shutdownNow();
    }

    private record DirectoryDraft(
            Long locationId,
            String slug,
            String tenantSlug,
            String publicName,
            String publicDescription,
            String logoUrl,
            PhysicalAddressResponse physicalAddress,
            String displayAddress,
            String googleQueryAddress,
            String physicalQueryAddress,
            String publicPhone,
            String category,
            boolean publicBookingEnabled,
            String bookingUrl,
            String googlePlaceId
    ) {
        DirectoryLocationResponse toResponse(
                Double rating,
                Long reviewCount,
                String mapsUri,
                Double latitude,
                Double longitude
        ) {
            return new DirectoryLocationResponse(
                    locationId,
                    slug,
                    tenantSlug,
                    true,
                    publicName,
                    publicDescription,
                    logoUrl,
                    physicalAddress,
                    displayAddress,
                    publicPhone,
                    category,
                    publicBookingEnabled,
                    bookingUrl,
                    rating,
                    reviewCount,
                    emptyIfNull(mapsUri),
                    latitude,
                    longitude,
                    null
            );
        }
    }

    public record PhysicalAddressResponse(
            String address,
            String postalCode,
            String city,
            String country
    ) {}

    public record NearbySearchResponse(
            String query,
            String resolvedAddress,
            double latitude,
            double longitude,
            Double radiusKm,
            List<DirectoryLocationResponse> locations
    ) {}

    public record DirectoryLocationResponse(
            Long locationId,
            String slug,
            String tenantSlug,
            boolean publiclyDiscoverable,
            String publicName,
            String publicDescription,
            String logoUrl,
            PhysicalAddressResponse physicalAddress,
            String publicAddress,
            String publicPhone,
            String category,
            boolean publicBookingEnabled,
            String bookingUrl,
            Double googleRating,
            Long googleReviewCount,
            String googleMapsUri,
            Double latitude,
            Double longitude,
            Double distanceKm
    ) {
        DirectoryLocationResponse withDistance(double value) {
            return new DirectoryLocationResponse(
                    locationId,
                    slug,
                    tenantSlug,
                    publiclyDiscoverable,
                    publicName,
                    publicDescription,
                    logoUrl,
                    physicalAddress,
                    publicAddress,
                    publicPhone,
                    category,
                    publicBookingEnabled,
                    bookingUrl,
                    googleRating,
                    googleReviewCount,
                    googleMapsUri,
                    latitude,
                    longitude,
                    value
            );
        }
    }
}
