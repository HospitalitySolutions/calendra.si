package com.example.app.company;

import com.example.app.google.places.GooglePlacesClient;
import com.example.app.google.places.GooglePlacesProperties;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
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
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class PublicCompanyDirectoryService {
    private static final Logger log = LoggerFactory.getLogger(PublicCompanyDirectoryService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> DIRECTORY_SETTING_KEYS = Set.of(
            SettingKey.PUBLIC_DIRECTORY_ENABLED.name(),
            SettingKey.GUEST_APP_SETTINGS_JSON.name(),
            SettingKey.MODULE_CONFIG_TYPE.name(),
            SettingKey.COMPANY_LOGO_URL.name(),
            SettingKey.COMPANY_PHYSICAL_ADDRESS.name(),
            SettingKey.COMPANY_PHYSICAL_POSTAL_CODE.name(),
            SettingKey.COMPANY_PHYSICAL_CITY.name(),
            SettingKey.COMPANY_PHYSICAL_COUNTRY.name(),
            SettingKey.COMPANY_ADDRESS.name(),
            SettingKey.COMPANY_POSTAL_CODE.name(),
            SettingKey.COMPANY_CITY.name(),
            SettingKey.TENANCY_ACCESS_STATUS.name(),
            SettingKey.GOOGLE_PLACE_ID.name()
    );

    private final AppSettingRepository settings;
    private final GooglePlacesClient googlePlaces;
    private final ExecutorService googleLookupExecutor;

    public PublicCompanyDirectoryService(
            AppSettingRepository settings,
            GooglePlacesClient googlePlaces,
            GooglePlacesProperties googlePlacesProperties
    ) {
        this.settings = settings;
        this.googlePlaces = googlePlaces;
        this.googleLookupExecutor = Executors.newFixedThreadPool(
                googlePlacesProperties.effectiveMaxConcurrentLookups(),
                Thread.ofPlatform().daemon(true).name("google-places-directory-", 0).factory()
        );
    }

    public List<DirectoryCompanyResponse> list() {
        LinkedHashMap<Long, Company> publicCompanies = new LinkedHashMap<>();
        for (AppSetting setting : settings.findAllByKey(SettingKey.PUBLIC_DIRECTORY_ENABLED.name())) {
            if (enabled(setting.getValue()) && setting.getCompany() != null && setting.getCompany().getId() != null) {
                publicCompanies.put(setting.getCompany().getId(), setting.getCompany());
            }
        }
        if (publicCompanies.isEmpty()) {
            return List.of();
        }

        Map<Long, Map<String, String>> valuesByCompany = settings.findAllByCompanyIdsAndKeys(
                        publicCompanies.keySet(),
                        DIRECTORY_SETTING_KEYS
                ).stream()
                .collect(Collectors.groupingBy(
                        row -> row.getCompany().getId(),
                        LinkedHashMap::new,
                        Collectors.toMap(AppSetting::getKey, AppSetting::getValue, (a, b) -> b, LinkedHashMap::new)
                ));

        List<DirectoryDraft> drafts = new ArrayList<>();
        for (Company company : publicCompanies.values()) {
            Map<String, String> values = valuesByCompany.getOrDefault(company.getId(), Map.of());
            DirectoryDraft draft = toDraft(company, values);
            if (draft != null) {
                drafts.add(draft);
            }
        }

        List<DirectoryCompanyResponse> result;
        if (googlePlaces.isConfigured()) {
            List<CompletableFuture<DirectoryCompanyResponse>> lookups = drafts.stream()
                    .map(draft -> CompletableFuture
                            .supplyAsync(() -> enrichWithGoogle(draft), googleLookupExecutor)
                            .exceptionally(error -> {
                                log.warn("Could not enrich public directory company {} with Google Places data.", draft.tenantSlug(), error);
                                return draft.toResponse(null, null, fallbackMapsUrl(draft.displayAddress()));
                            }))
                    .toList();
            result = lookups.stream()
                    .map(CompletableFuture::join)
                    .collect(Collectors.toCollection(ArrayList::new));
        } else {
            result = drafts.stream()
                    .map(draft -> draft.toResponse(null, null, fallbackMapsUrl(draft.displayAddress())))
                    .collect(Collectors.toCollection(ArrayList::new));
        }

        result.sort(Comparator.comparing(DirectoryCompanyResponse::publicName, String.CASE_INSENSITIVE_ORDER));
        return result;
    }

    private DirectoryCompanyResponse enrichWithGoogle(DirectoryDraft draft) {
        GooglePlacesClient.PlaceReviewSummary google = googlePlaces
                .lookup(draft.googlePlaceId(), draft.publicName(), draft.googleQueryAddress())
                .orElse(null);
        Double rating = google == null ? null : google.rating();
        Long reviewCount = google == null ? null : google.reviewCount();
        String mapsUri = firstNonBlank(
                google == null ? null : google.googleMapsUri(),
                fallbackMapsUrl(draft.displayAddress())
        );
        return draft.toResponse(rating, reviewCount, mapsUri);
    }

    private static DirectoryDraft toDraft(Company company, Map<String, String> values) {
        String accessStatus = firstNonBlank(values.get(SettingKey.TENANCY_ACCESS_STATUS.name()));
        if ("SUSPENDED".equalsIgnoreCase(accessStatus) || "CANCELLED".equalsIgnoreCase(accessStatus)) {
            return null;
        }

        JsonNode guest = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        String publicName = text(guest.path("publicName"));
        if (publicName == null) {
            return null;
        }

        String publicDescription = emptyIfNull(text(guest.path("publicDescription")));
        String street = firstNonBlank(
                values.get(SettingKey.COMPANY_PHYSICAL_ADDRESS.name()),
                values.get(SettingKey.COMPANY_ADDRESS.name())
        );
        String postalCode = firstNonBlank(
                values.get(SettingKey.COMPANY_PHYSICAL_POSTAL_CODE.name()),
                values.get(SettingKey.COMPANY_POSTAL_CODE.name())
        );
        String city = firstNonBlank(
                values.get(SettingKey.COMPANY_PHYSICAL_CITY.name()),
                values.get(SettingKey.COMPANY_CITY.name())
        );
        String country = firstNonBlank(values.get(SettingKey.COMPANY_PHYSICAL_COUNTRY.name()));
        String displayAddress = formatAddress(street, postalCode, city);
        String googleQueryAddress = joinNonBlank(displayAddress, country);
        String category = normalizeCategory(firstNonBlank(
                values.get(SettingKey.MODULE_CONFIG_TYPE.name()),
                text(guest.path("tenantType"))
        ));
        String logoUrl = firstNonBlank(
                values.get(SettingKey.COMPANY_LOGO_URL.name()),
                text(guest.path("logoImageUrl"))
        );
        String tenantSlug = firstNonBlank(company.getTenantCode(), String.valueOf(company.getId()));
        String slug = slugify(firstNonBlank(company.getTenantCode(), publicName, String.valueOf(company.getId())));
        String googlePlaceId = firstNonBlank(values.get(SettingKey.GOOGLE_PLACE_ID.name()));

        return new DirectoryDraft(
                slug,
                tenantSlug,
                publicName,
                publicDescription,
                logoUrl,
                new PhysicalAddressResponse(emptyIfNull(street), emptyIfNull(postalCode), emptyIfNull(city)),
                displayAddress,
                googleQueryAddress,
                category,
                googlePlaceId
        );
    }

    private static String formatAddress(String street, String postalCode, String city) {
        String locality = joinWithSpace(postalCode, city);
        if (street == null) return emptyIfNull(locality);
        if (locality == null) return street;
        return street + ", " + locality;
    }

    private static String fallbackMapsUrl(String address) {
        if (address == null || address.isBlank()) return "";
        String encoded = URLEncoder.encode(address, StandardCharsets.UTF_8).replace("+", "%20");
        return "https://www.google.com/maps/search/?api=1&query=" + encoded;
    }

    private static boolean enabled(String value) {
        return value != null && "true".equalsIgnoreCase(value.trim());
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
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) return value.trim();
        }
        return null;
    }

    private static String emptyIfNull(String value) {
        return value == null ? "" : value;
    }

    private static String joinWithSpace(String first, String second) {
        List<String> values = new ArrayList<>();
        if (first != null && !first.isBlank()) values.add(first.trim());
        if (second != null && !second.isBlank()) values.add(second.trim());
        return values.isEmpty() ? null : String.join(" ", values);
    }

    private static String joinNonBlank(String... values) {
        LinkedHashSet<String> normalized = new LinkedHashSet<>();
        for (String value : values) {
            if (value != null && !value.isBlank()) normalized.add(value.trim());
        }
        return String.join(", ", normalized);
    }

    private static String normalizeCategory(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replace('-', '_');
        return switch (value) {
            case "gym", "personal_training", "fitness", "sport", "šport" -> "fitness";
            case "therapy", "health", "healthcare", "zdravje" -> "health";
            case "spa", "wellness" -> "wellness";
            case "consulting", "counselling", "counseling", "svetovanje" -> "consulting";
            case "salon", "beauty", "lepota" -> "salon";
            default -> null;
        };
    }

    private static String slugify(String value) {
        String normalized = Normalizer.normalize(value == null ? "" : value, Normalizer.Form.NFD)
                .replaceAll("\\p{M}+", "")
                .toLowerCase(Locale.ROOT)
                .replaceAll("[^a-z0-9]+", "-")
                .replaceAll("(^-|-$)", "");
        return normalized.isBlank() ? "company" : normalized;
    }

    @PreDestroy
    void shutdownGoogleLookupExecutor() {
        googleLookupExecutor.shutdownNow();
    }

    private record DirectoryDraft(
            String slug,
            String tenantSlug,
            String publicName,
            String publicDescription,
            String logoUrl,
            PhysicalAddressResponse physicalAddress,
            String displayAddress,
            String googleQueryAddress,
            String category,
            String googlePlaceId
    ) {
        DirectoryCompanyResponse toResponse(Double rating, Long reviewCount, String mapsUri) {
            return new DirectoryCompanyResponse(
                    slug,
                    tenantSlug,
                    true,
                    publicName,
                    publicDescription,
                    logoUrl,
                    physicalAddress,
                    category,
                    rating,
                    reviewCount,
                    emptyIfNull(mapsUri)
            );
        }
    }

    public record PhysicalAddressResponse(
            String address,
            String postalCode,
            String city
    ) {}

    public record DirectoryCompanyResponse(
            String slug,
            String tenantSlug,
            boolean publiclyDiscoverable,
            String publicName,
            String publicDescription,
            String logoUrl,
            PhysicalAddressResponse physicalAddress,
            String category,
            Double googleRating,
            Long googleReviewCount,
            String googleMapsUri
    ) {}
}
