package com.example.app.widget;

import com.example.app.guest.common.GuestSettingsService;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Tenant-owned configuration for the public website booking widget.
 *
 * The guest mobile app keeps its own GUEST_* settings. The website widget uses
 * WEBSITE_* keys so tenants can turn employee selection, payment methods,
 * deposit/full payment, and pay-on-location on/off independently per channel.
 */
@Service
public class WebsiteWidgetSettingsService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final List<String> DEFAULT_ACCEPTED_CONFIG_IDS = List.of("online_card", "bank_transfer", "paypal", "gift_card");

    private final AppSettingRepository settings;
    private final GlobalPaymentProviderService globalPaymentProviders;

    public WebsiteWidgetSettingsService(AppSettingRepository settings, GlobalPaymentProviderService globalPaymentProviders) {
        this.settings = settings;
        this.globalPaymentProviders = globalPaymentProviders;
    }

    public WebsiteWidgetSettings widgetSettings(Long companyId) {
        Map<String, String> values = values(companyId);
        JsonNode root = parse(firstNonBlank(
                values.get(SettingKey.WEBSITE_WIDGET_SETTINGS_JSON.name()),
                values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name())
        ));
        JsonNode rulesRoot = parse(firstNonBlank(
                values.get(SettingKey.WEBSITE_BOOKING_RULES_JSON.name()),
                values.get(SettingKey.GUEST_BOOKING_RULES_JSON.name())
        ));
        boolean paymentOnLocation = root.has("paymentOnLocation")
                ? root.path("paymentOnLocation").asBoolean(true)
                : "none".equalsIgnoreCase(rulesRoot.path("paymentRequirement").asText(""));
        return new WebsiteWidgetSettings(
                root.path("employeeSelectionStep").asBoolean(false),
                paymentOnLocation ? List.of() : parseAcceptedConfigIds(root.path("acceptedPaymentMethodIds")),
                paymentOnLocation
        );
    }

    public GuestSettingsService.GuestBookingRules bookingRules(Long companyId) {
        Map<String, String> values = values(companyId);
        JsonNode root = parse(firstNonBlank(
                values.get(SettingKey.WEBSITE_BOOKING_RULES_JSON.name()),
                values.get(SettingKey.GUEST_BOOKING_RULES_JSON.name())
        ));
        JsonNode widgetRoot = parse(firstNonBlank(
                values.get(SettingKey.WEBSITE_WIDGET_SETTINGS_JSON.name()),
                values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name())
        ));
        boolean billingEnabled = settingEnabled(values, SettingKey.BILLING_ENABLED, true);
        boolean advanceBillingEnabled = billingEnabled && settingEnabled(values, SettingKey.BILLING_ADVANCE_ENABLED, true);
        if (!billingEnabled || !advanceBillingEnabled) {
            return new GuestSettingsService.GuestBookingRules(
                    root.path("cancelUntilHours").asInt(24),
                    root.path("rescheduleUntilHours").asInt(12),
                    root.path("lateCancelConsumesCredit").asBoolean(true),
                    root.path("noShowConsumesCredit").asBoolean(true),
                    false,
                    false,
                    List.of(),
                    List.of(),
                    List.of(),
                    false,
                    "none",
                    normalizeDepositPercent(root.path("depositPercent").asInt(20))
            );
        }

        boolean paymentOnLocation = widgetRoot.has("paymentOnLocation")
                ? widgetRoot.path("paymentOnLocation").asBoolean(true)
                : "none".equalsIgnoreCase(root.path("paymentRequirement").asText(""));
        List<String> acceptedOnlineMethods = paymentOnLocation
                ? List.of()
                : parseAcceptedRuntimeTypes(widgetRoot.path("acceptedPaymentMethodIds"));
        boolean requireOnlinePayment = !acceptedOnlineMethods.isEmpty();
        String paymentRequirement = normalizePaymentRequirement(root.path("paymentRequirement").asText(null), requireOnlinePayment);
        if (paymentOnLocation) {
            paymentRequirement = "none";
        }
        int depositPercent = normalizeDepositPercent(root.path("depositPercent").asInt(20));
        return new GuestSettingsService.GuestBookingRules(
                root.path("cancelUntilHours").asInt(24),
                root.path("rescheduleUntilHours").asInt(12),
                root.path("lateCancelConsumesCredit").asBoolean(true),
                root.path("noShowConsumesCredit").asBoolean(true),
                root.path("sameDayBankTransferAllowed").asBoolean(false),
                root.path("bankTransferReservesSlot").asBoolean(false),
                readTextArray(root.path("allowBankTransferFor"), List.of("SESSION_SINGLE", "PACK", "MEMBERSHIP", "GIFT_CARD")),
                readTextArray(root.path("allowCardFor"), List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP", "GIFT_CARD")),
                readTextArray(root.path("allowPaypalFor"), List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP", "GIFT_CARD")),
                requireOnlinePayment,
                paymentRequirement,
                depositPercent
        );
    }

    public List<String> acceptedPaymentMethods(Long companyId) {
        Map<String, String> values = values(companyId);
        if (!settingEnabled(values, SettingKey.BILLING_ENABLED, true)) {
            return List.of();
        }
        JsonNode root = parse(firstNonBlank(
                values.get(SettingKey.WEBSITE_WIDGET_SETTINGS_JSON.name()),
                values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name())
        ));
        JsonNode rulesRoot = parse(firstNonBlank(
                values.get(SettingKey.WEBSITE_BOOKING_RULES_JSON.name()),
                values.get(SettingKey.GUEST_BOOKING_RULES_JSON.name())
        ));
        boolean paymentOnLocation = root.has("paymentOnLocation")
                ? root.path("paymentOnLocation").asBoolean(true)
                : "none".equalsIgnoreCase(rulesRoot.path("paymentRequirement").asText(""));
        if (paymentOnLocation) {
            return List.of();
        }
        List<String> accepted = parseAcceptedRuntimeTypes(root.path("acceptedPaymentMethodIds"));
        return applyGlobalProviderCapabilitiesWithoutFallback(accepted, values);
    }

    private List<String> applyGlobalProviderCapabilitiesWithoutFallback(List<String> accepted, Map<String, String> values) {
        var global = globalPaymentProviders.capabilities();
        boolean tenantStripeEnabled = settingEnabled(values, SettingKey.BILLING_ONLINE_CARD_PAYMENTS_ENABLED, true);
        return (accepted == null ? List.<String>of() : accepted).stream()
                .filter(method -> !"CARD".equals(method) || (global.stripeEnabled() && tenantStripeEnabled))
                .filter(method -> !"PAYPAL".equals(method) || global.paypalEnabled())
                .toList();
    }

    public boolean widgetEnabled(Long companyId) {
        return settingEnabled(values(companyId), SettingKey.WEBSITE_WIDGET_ENABLED, true);
    }

    public boolean billingEnabled(Long companyId) {
        return settingEnabled(values(companyId), SettingKey.BILLING_ENABLED, true);
    }

    public boolean advanceBillingEnabled(Long companyId) {
        Map<String, String> values = values(companyId);
        return settingEnabled(values, SettingKey.BILLING_ENABLED, true)
                && settingEnabled(values, SettingKey.BILLING_ADVANCE_ENABLED, true);
    }

    private Map<String, String> values(Long companyId) {
        return settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
    }

    private static JsonNode parse(String raw) {
        if (raw == null || raw.isBlank()) return JSON.createObjectNode();
        try {
            return JSON.readTree(raw);
        } catch (Exception ex) {
            return JSON.createObjectNode();
        }
    }

    private static String firstNonBlank(String primary, String fallback) {
        if (primary != null && !primary.isBlank()) return primary;
        return fallback;
    }

    private static boolean settingEnabled(Map<String, String> values, SettingKey key, boolean defaultValue) {
        String raw = values == null ? null : values.get(key.name());
        if (raw == null || raw.isBlank()) return defaultValue;
        if ("true".equalsIgnoreCase(raw.trim())) return true;
        if ("false".equalsIgnoreCase(raw.trim())) return false;
        return defaultValue;
    }

    private static List<String> parseAcceptedConfigIds(JsonNode node) {
        // Missing/legacy config keeps the previous permissive default. A saved empty
        // array must stay empty so Configuration -> Website can intentionally hide
        // all online methods and leave only pay-on-location, if enabled.
        if (node == null || !node.isArray()) return DEFAULT_ACCEPTED_CONFIG_IDS;
        Set<String> out = new LinkedHashSet<>();
        for (JsonNode entry : node) {
            String normalized = normalizeConfigId(entry.asText());
            if (normalized != null) out.add(normalized);
        }
        return new ArrayList<>(out);
    }

    private static List<String> parseAcceptedRuntimeTypes(JsonNode node) {
        if (node == null || !node.isArray()) return List.of("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD");
        Set<String> out = new LinkedHashSet<>();
        for (JsonNode entry : node) {
            String runtime = mapConfigIdToRuntimeType(entry.asText());
            if (runtime != null) out.add(runtime);
        }
        return new ArrayList<>(out);
    }

    private static String normalizeConfigId(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (value) {
            case "online_card", "card" -> "online_card";
            case "bank_transfer" -> "bank_transfer";
            case "paypal" -> "paypal";
            case "gift_card" -> "gift_card";
            default -> null;
        };
    }

    private static String mapConfigIdToRuntimeType(String raw) {
        String value = normalizeConfigId(raw);
        if (value == null) return null;
        return switch (value) {
            case "online_card" -> "CARD";
            case "bank_transfer" -> "BANK_TRANSFER";
            case "paypal" -> "PAYPAL";
            case "gift_card" -> "GIFT_CARD";
            default -> null;
        };
    }

    private static List<String> readTextArray(JsonNode node, List<String> fallback) {
        if (node == null || !node.isArray()) return fallback;
        List<String> out = new ArrayList<>();
        for (JsonNode item : node) {
            String value = item.asText(null);
            if (value != null && !value.isBlank()) out.add(value.trim());
        }
        return out.isEmpty() ? fallback : out;
    }

    private static String normalizePaymentRequirement(String raw, boolean requireOnlinePayment) {
        if (!requireOnlinePayment) return "none";
        if ("deposit".equalsIgnoreCase(raw)) return "deposit";
        return "full";
    }

    private static int normalizeDepositPercent(int raw) {
        return Math.max(1, Math.min(100, raw));
    }

    public record WebsiteWidgetSettings(
            boolean employeeSelectionStep,
            List<String> acceptedPaymentMethodIds,
            boolean paymentOnLocation
    ) {}
}
