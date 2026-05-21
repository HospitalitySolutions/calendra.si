package com.example.app.guest.common;

import com.example.app.settings.AppSettingRepository;
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

@Service
public class GuestSettingsService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final AppSettingRepository settings;

    public GuestSettingsService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public GuestPublicSettings publicSettings(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        JsonNode root = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        boolean enabled = root.path("guestAppEnabled").asBoolean(true);
        boolean discoverable = root.path("publicDiscoverable").asBoolean(false);
        String name = textOrNull(root.path("publicName"));
        String description = textOrNull(root.path("publicDescription"));
        String city = textOrNull(root.path("publicCity"));
        String phone = textOrNull(root.path("publicPhone"));
        String tenantType = normalizeTenantType(textOrNull(root.path("tenantType")));
        String cardImageUrl = textOrNull(root.path("cardImageUrl"));
        String logoImageUrl = textOrNull(root.path("logoImageUrl"));
        String iconImageUrl = textOrNull(root.path("iconImageUrl"));
        String street = textOrNull(values.get(SettingKey.COMPANY_ADDRESS.name()));
        String postal = textOrNull(values.get(SettingKey.COMPANY_POSTAL_CODE.name()));
        String companyCity = textOrNull(values.get(SettingKey.COMPANY_CITY.name()));
        String formattedAddress = formatCompanyAddressLine(street, postal, companyCity);
        String invoiceCompanyName = textOrNull(values.get(SettingKey.COMPANY_NAME.name()));
        if (phone == null) {
            phone = textOrNull(values.get(SettingKey.COMPANY_TELEPHONE.name()));
        }
        String defaultLanguage = root.path("defaultLanguage").asText("sl");
        boolean employeeSelectionStep = root.path("employeeSelectionStep").asBoolean(false);
        boolean useEmployeeContact = root.path("useEmployeeContact").asBoolean(false);
        return new GuestPublicSettings(enabled, discoverable, name, description, city, phone, formattedAddress, invoiceCompanyName, defaultLanguage, employeeSelectionStep, useEmployeeContact, tenantType, cardImageUrl, logoImageUrl, iconImageUrl);
    }

    /**
     * Runtime payment methods enabled for the tenant in the guest app.
     * Returned values are runtime ids: {@code CARD}, {@code BANK_TRANSFER}, {@code PAYPAL}, {@code GIFT_CARD}.
     * Legacy config ids (cash, card_on_location) are filtered out. When config is missing or empty,
     * the full default set is returned so existing tenants keep working.
     */
    public List<String> acceptedPaymentMethods(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        JsonNode root = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        return parseAcceptedPaymentMethods(root.path("acceptedPaymentMethodIds"));
    }

    static List<String> parseAcceptedPaymentMethods(JsonNode node) {
        Set<String> out = new LinkedHashSet<>();
        if (node != null && node.isArray()) {
            for (JsonNode entry : node) {
                String runtime = mapConfigIdToRuntimeType(entry.asText());
                if (runtime != null) {
                    out.add(runtime);
                }
            }
        }
        if (out.isEmpty()) {
            return List.of("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD");
        }
        return new ArrayList<>(out);
    }

    private static String mapConfigIdToRuntimeType(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "online_card", "card" -> "CARD";
            case "bank_transfer" -> "BANK_TRANSFER";
            case "paypal" -> "PAYPAL";
            case "gift_card" -> "GIFT_CARD";
            default -> null;
        };
    }

    public GuestBookingRules bookingRules(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        JsonNode root = parse(values.get(SettingKey.GUEST_BOOKING_RULES_JSON.name()));
        JsonNode guestAppRoot = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        boolean requireOnlinePayment;
        if (root.has("requireOnlinePayment")) {
            requireOnlinePayment = root.path("requireOnlinePayment").asBoolean(true);
        } else if (guestAppRoot.has("paymentOnLocation")) {
            requireOnlinePayment = !guestAppRoot.path("paymentOnLocation").asBoolean(true);
        } else {
            requireOnlinePayment = true;
        }
        String paymentRequirement = normalizePaymentRequirement(root.path("paymentRequirement").asText(null), requireOnlinePayment);
        int depositPercent = normalizeDepositPercent(root.path("depositPercent").asInt(20));
        return new GuestBookingRules(
                root.path("cancelUntilHours").asInt(24),
                root.path("rescheduleUntilHours").asInt(12),
                root.path("lateCancelConsumesCredit").asBoolean(true),
                root.path("noShowConsumesCredit").asBoolean(true),
                root.path("sameDayBankTransferAllowed").asBoolean(false),
                root.path("bankTransferReservesSlot").asBoolean(false),
                readTextArray(root.path("allowBankTransferFor"), List.of("PACK", "MEMBERSHIP")),
                readTextArray(root.path("allowCardFor"), List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP")),
                readTextArray(root.path("allowPaypalFor"), List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP")),
                requireOnlinePayment,
                paymentRequirement,
                depositPercent
        );
    }

    private static JsonNode parse(String raw) {
        if (raw == null || raw.isBlank()) {
            return JSON.createObjectNode();
        }
        try {
            return JSON.readTree(raw);
        } catch (Exception ex) {
            return JSON.createObjectNode();
        }
    }

    private static String textOrNull(JsonNode node) {
        return node == null || node.isMissingNode() || node.isNull() || node.asText().isBlank() ? null : node.asText();
    }

    private static String textOrNull(String raw) {
        return raw == null || raw.isBlank() ? null : raw.trim();
    }

    /** Street + postal + city, same shape as invoice PDF / reminder templates. */
    private static String formatCompanyAddressLine(String street, String postalCode, String city) {
        String line1 = street == null ? "" : street.strip();
        String pc = postalCode == null ? "" : postalCode.strip();
        String c = city == null ? "" : city.strip();
        StringBuilder sb = new StringBuilder();
        if (!line1.isEmpty()) {
            sb.append(line1);
        }
        if (!pc.isEmpty() || !c.isEmpty()) {
            if (sb.length() > 0) sb.append(", ");
            sb.append(pc);
            if (!pc.isEmpty() && !c.isEmpty()) sb.append(" ");
            sb.append(c);
        }
        String out = sb.toString().strip();
        return out.isEmpty() ? null : out;
    }

    private static String normalizeTenantType(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase(java.util.Locale.ROOT);
        return switch (value) {
            case "salon", "gym", "spa", "therapy" -> value;
            default -> null;
        };
    }

    private static List<String> readTextArray(JsonNode node, List<String> fallback) {
        if (node == null || !node.isArray()) return fallback;
        return java.util.stream.StreamSupport.stream(node.spliterator(), false)
                .map(JsonNode::asText)
                .filter(s -> s != null && !s.isBlank())
                .toList();
    }

    private static String normalizePaymentRequirement(String raw, boolean requireOnlinePayment) {
        if (raw == null || raw.isBlank()) {
            return requireOnlinePayment ? "full" : "none";
        }
        String value = raw.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "deposit", "full", "none" -> value;
            default -> requireOnlinePayment ? "full" : "none";
        };
    }

    private static int normalizeDepositPercent(int value) {
        if (value < 1) return 1;
        return Math.min(value, 100);
    }

    public record GuestPublicSettings(boolean guestAppEnabled, boolean publicDiscoverable, String publicName, String publicDescription, String publicCity, String publicPhone, String companyAddress, String invoiceCompanyName, String defaultLanguage, boolean employeeSelectionStep, boolean useEmployeeContact, String tenantType, String cardImageUrl, String logoImageUrl, String iconImageUrl) {}
    public record GuestBookingRules(
            int cancelUntilHours,
            int rescheduleUntilHours,
            boolean lateCancelConsumesCredit,
            boolean noShowConsumesCredit,
            boolean sameDayBankTransferAllowed,
            boolean bankTransferReservesSlot,
            List<String> allowBankTransferFor,
            List<String> allowCardFor,
            List<String> allowPaypalFor,
            boolean requireOnlinePayment,
            String paymentRequirement,
            int depositPercent
    ) {}
}
