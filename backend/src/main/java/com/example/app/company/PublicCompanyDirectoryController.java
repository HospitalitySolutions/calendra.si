package com.example.app.company;

import com.example.app.session.SessionTypeRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.text.Normalizer;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/public/company-directory")
public class PublicCompanyDirectoryController {
    private static final ObjectMapper JSON = new ObjectMapper();

    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final SessionTypeRepository sessionTypes;

    public PublicCompanyDirectoryController(
            CompanyRepository companies,
            AppSettingRepository settings,
            SessionTypeRepository sessionTypes
    ) {
        this.companies = companies;
        this.settings = settings;
        this.sessionTypes = sessionTypes;
    }

    @GetMapping
    public List<DirectoryCompanyResponse> list() {
        List<DirectoryCompanyResponse> result = new ArrayList<>();
        for (Company company : companies.findAll()) {
            Map<String, String> values = settings.findAllByCompanyId(company.getId()).stream()
                    .collect(Collectors.toMap(AppSetting::getKey, AppSetting::getValue, (a, b) -> b));
            if (!enabled(values.get(SettingKey.PUBLIC_DIRECTORY_ENABLED.name()))) continue;

            JsonNode guest = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
            String name = firstNonBlank(
                    text(guest.path("publicName")),
                    values.get(SettingKey.COMPANY_NAME.name()),
                    company.getName()
            );
            String city = firstNonBlank(
                    values.get(SettingKey.COMPANY_PHYSICAL_CITY.name()),
                    values.get(SettingKey.COMPANY_CITY.name())
            );
            String description = text(guest.path("publicDescription"));
            String category = normalizeCategory(text(guest.path("tenantType")));
            String logoUrl = firstNonBlank(
                    values.get(SettingKey.COMPANY_LOGO_URL.name()),
                    text(guest.path("logoImageUrl"))
            );
            long serviceCount = sessionTypes.findAllWithLinkedServicesByCompanyId(company.getId()).stream()
                    .filter(type -> type.isActive() && type.isGuestBookingEnabled())
                    .count();
            String tenantSlug = firstNonBlank(company.getTenantCode(), String.valueOf(company.getId()));
            result.add(new DirectoryCompanyResponse(
                    slugify(firstNonBlank(company.getTenantCode(), name, String.valueOf(company.getId()))),
                    tenantSlug,
                    name,
                    description,
                    city,
                    category,
                    logoUrl,
                    serviceCount
            ));
        }
        result.sort(Comparator.comparing(DirectoryCompanyResponse::name, String.CASE_INSENSITIVE_ORDER));
        return result;
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
        return "";
    }

    private static String normalizeCategory(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replace('-', '_');
        return switch (value) {
            case "gym", "personal_training", "fitness" -> "fitness";
            case "therapy", "health" -> "health";
            case "spa", "wellness" -> "wellness";
            case "consulting", "counselling" -> "consulting";
            default -> "salon";
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

    public record DirectoryCompanyResponse(
            String slug,
            String tenantSlug,
            String name,
            String description,
            String city,
            String category,
            String logoUrl,
            long serviceCount
    ) {}
}
