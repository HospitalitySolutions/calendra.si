package com.example.app.guest.common;

import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.List;
import java.util.Map;
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
        if (phone == null) {
            phone = textOrNull(values.get(SettingKey.COMPANY_TELEPHONE.name()));
        }
        String defaultLanguage = root.path("defaultLanguage").asText("sl");
        return new GuestPublicSettings(enabled, discoverable, name, description, city, phone, defaultLanguage);
    }

    public GuestBookingRules bookingRules(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        JsonNode root = parse(values.get(SettingKey.GUEST_BOOKING_RULES_JSON.name()));
        return new GuestBookingRules(
                root.path("cancelUntilHours").asInt(24),
                root.path("rescheduleUntilHours").asInt(12),
                root.path("lateCancelConsumesCredit").asBoolean(true),
                root.path("noShowConsumesCredit").asBoolean(true),
                root.path("sameDayBankTransferAllowed").asBoolean(false),
                root.path("bankTransferReservesSlot").asBoolean(false),
                readTextArray(root.path("allowBankTransferFor"), List.of("PACK", "MEMBERSHIP")),
                readTextArray(root.path("allowCardFor"), List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP"))
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

    private static List<String> readTextArray(JsonNode node, List<String> fallback) {
        if (node == null || !node.isArray()) return fallback;
        return java.util.stream.StreamSupport.stream(node.spliterator(), false)
                .map(JsonNode::asText)
                .filter(s -> s != null && !s.isBlank())
                .toList();
    }

    public record GuestPublicSettings(boolean guestAppEnabled, boolean publicDiscoverable, String publicName, String publicDescription, String publicCity, String publicPhone, String defaultLanguage) {}
    public record GuestBookingRules(int cancelUntilHours, int rescheduleUntilHours, boolean lateCancelConsumesCredit, boolean noShowConsumesCredit, boolean sameDayBankTransferAllowed, boolean bankTransferReservesSlot, List<String> allowBankTransferFor, List<String> allowCardFor) {}
}
