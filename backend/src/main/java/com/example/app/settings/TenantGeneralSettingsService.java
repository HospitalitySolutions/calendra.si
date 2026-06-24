package com.example.app.settings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Normalized tenant-wide settings used as the shared fallback for admin UI, guest app,
 * website widget, notification tokens and public-facing output.
 */
@Service
public class TenantGeneralSettingsService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final String DEFAULT_LANGUAGE = "sl";
    private static final String DEFAULT_TIME_ZONE = "Europe/Ljubljana";
    private static final String DEFAULT_CURRENCY = "EUR";
    private static final String DEFAULT_DATE_FORMAT = "DD_MM_YYYY";
    private static final String DEFAULT_TIME_FORMAT = "24H";
    private static final String DEFAULT_WEEK_START_DAY = "MONDAY";
    private static final String DEFAULT_PRIMARY_COLOR = "#2563EB";
    private static final String DEFAULT_ACCENT_COLOR = "#22C55E";

    private static final Set<String> SUPPORTED_CURRENCIES = Set.of("EUR", "USD", "GBP", "CHF", "HRK", "RSD", "BAM");
    private static final Set<String> SUPPORTED_DATE_FORMATS = Set.of("DD_MM_YYYY", "YYYY_MM_DD", "MM_DD_YYYY");
    private static final Set<String> SUPPORTED_TIME_FORMATS = Set.of("24H", "12H");
    private static final Set<String> SUPPORTED_WEEK_STARTS = Set.of("MONDAY", "SUNDAY", "SATURDAY");

    private final AppSettingRepository settings;

    public TenantGeneralSettingsService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public TenantGeneralSettings resolve(Long companyId) {
        Map<String, String> values = companyId == null
                ? Map.of()
                : settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(AppSetting::getKey, AppSetting::getValue, (a, b) -> b));
        return resolve(values);
    }

    public static TenantGeneralSettings resolve(Map<String, String> values) {
        Map<String, String> source = values == null ? Map.of() : values;
        JsonNode guestApp = parse(source.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));

        String companyAddress = formatCompanyAddress(
                text(source.get(SettingKey.COMPANY_ADDRESS.name())),
                text(source.get(SettingKey.COMPANY_POSTAL_CODE.name())),
                text(source.get(SettingKey.COMPANY_CITY.name()))
        );

        return new TenantGeneralSettings(
                normalizeLanguage(firstNonBlank(
                        source.get(SettingKey.TENANT_DEFAULT_LANGUAGE.name()),
                        textOrNull(guestApp.path("defaultLanguage")),
                        DEFAULT_LANGUAGE
                )),
                normalizeTimeZone(source.get(SettingKey.TENANT_TIME_ZONE.name())),
                normalizeCurrency(firstNonBlank(
                        source.get(SettingKey.TENANT_CURRENCY.name()),
                        textOrNull(guestApp.path("paymentCurrency")),
                        DEFAULT_CURRENCY
                )),
                normalizeDateFormat(source.get(SettingKey.TENANT_DATE_FORMAT.name())),
                normalizeTimeFormat(source.get(SettingKey.TENANT_TIME_FORMAT.name())),
                normalizeWeekStart(source.get(SettingKey.TENANT_WEEK_START_DAY.name())),
                firstNonBlank(
                        source.get(SettingKey.TENANT_PUBLIC_COMPANY_NAME.name()),
                        textOrNull(guestApp.path("publicName")),
                        source.get(SettingKey.COMPANY_NAME.name()),
                        ""
                ),
                firstNonBlank(
                        source.get(SettingKey.TENANT_CONTACT_PHONE.name()),
                        textOrNull(guestApp.path("publicPhone")),
                        source.get(SettingKey.COMPANY_TELEPHONE.name()),
                        ""
                ),
                firstNonBlank(
                        source.get(SettingKey.TENANT_CONTACT_EMAIL.name()),
                        source.get(SettingKey.COMPANY_EMAIL.name()),
                        ""
                ),
                firstNonBlank(source.get(SettingKey.TENANT_CONTACT_WEBSITE.name()), ""),
                firstNonBlank(source.get(SettingKey.TENANT_CONTACT_ADDRESS.name()), companyAddress, ""),
                firstNonBlank(
                        source.get(SettingKey.TENANT_BRAND_LOGO_BASE64.name()),
                        source.get(SettingKey.COMPANY_LOGO_BASE64.name()),
                        ""
                ),
                normalizeHexColor(source.get(SettingKey.TENANT_BRAND_PRIMARY_COLOR.name()), DEFAULT_PRIMARY_COLOR),
                normalizeHexColor(source.get(SettingKey.TENANT_BRAND_ACCENT_COLOR.name()), DEFAULT_ACCENT_COLOR)
        );
    }

    public static ZoneId zoneIdOrDefault(String raw) {
        try {
            return ZoneId.of(normalizeTimeZone(raw));
        } catch (Exception ignored) {
            return ZoneId.of(DEFAULT_TIME_ZONE);
        }
    }

    public static String normalizeLanguage(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        return "en".equals(value) ? "en" : DEFAULT_LANGUAGE;
    }

    public static String normalizeTimeZone(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isBlank()) return DEFAULT_TIME_ZONE;
        try {
            return ZoneId.of(value).getId();
        } catch (Exception ignored) {
            return DEFAULT_TIME_ZONE;
        }
    }

    public static String normalizeCurrency(String raw) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        if (SUPPORTED_CURRENCIES.contains(value)) return value;
        if (value.matches("^[A-Z]{3}$")) return value;
        return DEFAULT_CURRENCY;
    }

    public static String normalizeDateFormat(String raw) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace('/', '_');
        return SUPPORTED_DATE_FORMATS.contains(value) ? value : DEFAULT_DATE_FORMAT;
    }

    public static String normalizeTimeFormat(String raw) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replace(" ", "");
        return SUPPORTED_TIME_FORMATS.contains(value) ? value : DEFAULT_TIME_FORMAT;
    }

    public static String normalizeWeekStart(String raw) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return SUPPORTED_WEEK_STARTS.contains(value) ? value : DEFAULT_WEEK_START_DAY;
    }

    public static String normalizeHexColor(String raw, String fallback) {
        String value = raw == null ? "" : raw.trim();
        return value.matches("^#[0-9a-fA-F]{6}$") ? value.toUpperCase(Locale.ROOT) : fallback;
    }

    public static String normalizeLogoDataUri(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isBlank()) return "";
        if (value.length() > 1_500_000) return "";
        String lower = value.toLowerCase(Locale.ROOT);
        if (lower.startsWith("data:image/png;base64,")
                || lower.startsWith("data:image/jpeg;base64,")
                || lower.startsWith("data:image/jpg;base64,")
                || lower.startsWith("data:image/webp;base64,")
                || lower.startsWith("data:image/svg+xml;base64,")) {
            return value;
        }
        return "";
    }

    public static String currencySymbol(String currency) {
        return switch (normalizeCurrency(currency)) {
            case "EUR" -> "€";
            case "USD" -> "$";
            case "GBP" -> "£";
            case "CHF" -> "CHF";
            default -> normalizeCurrency(currency);
        };
    }

    public static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) return value.trim();
        }
        return "";
    }

    private static String formatCompanyAddress(String street, String postal, String city) {
        String line1 = text(street);
        String line2 = (text(postal) + " " + text(city)).trim();
        if (!line1.isBlank() && !line2.isBlank()) return line1 + ", " + line2;
        return firstNonBlank(line1, line2);
    }

    private static String text(String value) {
        return value == null ? "" : value.trim();
    }

    private static String textOrNull(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) return null;
        String value = node.asText(null);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static JsonNode parse(String raw) {
        if (raw == null || raw.isBlank()) return JSON.createObjectNode();
        try {
            return JSON.readTree(raw);
        } catch (Exception ignored) {
            return JSON.createObjectNode();
        }
    }

    public record TenantGeneralSettings(
            String defaultLanguage,
            String timeZone,
            String currency,
            String dateFormat,
            String timeFormat,
            String weekStartDay,
            String publicCompanyName,
            String contactPhone,
            String contactEmail,
            String contactWebsite,
            String contactAddress,
            String brandLogoBase64,
            String brandPrimaryColor,
            String brandAccentColor
    ) {}
}
