package com.example.app.waitlist;

import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class WaitlistSettingsService {
    private final AppSettingRepository settings;
    private final ObjectMapper json;

    public WaitlistSettingsService(AppSettingRepository settings, ObjectMapper json) {
        this.settings = settings;
        this.json = json;
    }

    public record WaitlistSettings(
            boolean enabled,
            boolean widgetEnabled,
            boolean guestAppEnabled,
            boolean exactTimeEnabled,
            boolean flexibleWindowsEnabled,
            boolean employeePreferenceEnabled,
            boolean autoOfferEnabled,
            int offerValidityMinutes,
            int maxActiveRequestsPerGuest,
            int maxRequestedDateRangeDays,
            boolean staffManualEntryEnabled,
            boolean closeEquivalentAfterBooking,
            boolean notifyEmail,
            boolean notifySms,
            boolean notifyGuestApp
    ) {}

    public WaitlistSettings get(Long companyId) {
        String raw = settings.findByCompanyIdAndKey(companyId, SettingKey.WAITLIST_SETTINGS_JSON)
                .map(AppSetting::getValue)
                .orElse("");
        try {
            JsonNode node = raw.isBlank() ? json.createObjectNode() : json.readTree(raw);
            return new WaitlistSettings(
                    bool(node, "enabled", true),
                    bool(node, "widgetEnabled", true),
                    bool(node, "guestAppEnabled", true),
                    bool(node, "exactTimeEnabled", true),
                    bool(node, "flexibleWindowsEnabled", true),
                    bool(node, "employeePreferenceEnabled", true),
                    bool(node, "autoOfferEnabled", false),
                    integer(node, "offerValidityMinutes", 15, 5, 1440),
                    integer(node, "maxActiveRequestsPerGuest", 5, 1, 100),
                    integer(node, "maxRequestedDateRangeDays", 30, 1, 365),
                    bool(node, "staffManualEntryEnabled", true),
                    bool(node, "closeEquivalentAfterBooking", true),
                    bool(node, "notifyEmail", true),
                    bool(node, "notifySms", false),
                    bool(node, "notifyGuestApp", true)
            );
        } catch (Exception ignored) {
            return defaults();
        }
    }

    public String normalizeJson(String raw) {
        WaitlistSettings value;
        try {
            JsonNode node = raw == null || raw.isBlank() ? json.createObjectNode() : json.readTree(raw);
            value = new WaitlistSettings(
                    bool(node, "enabled", true), bool(node, "widgetEnabled", true), bool(node, "guestAppEnabled", true),
                    bool(node, "exactTimeEnabled", true), bool(node, "flexibleWindowsEnabled", true), bool(node, "employeePreferenceEnabled", true),
                    bool(node, "autoOfferEnabled", false), integer(node, "offerValidityMinutes", 15, 5, 1440),
                    integer(node, "maxActiveRequestsPerGuest", 5, 1, 100), integer(node, "maxRequestedDateRangeDays", 30, 1, 365),
                    bool(node, "staffManualEntryEnabled", true), bool(node, "closeEquivalentAfterBooking", true),
                    bool(node, "notifyEmail", true), bool(node, "notifySms", false), bool(node, "notifyGuestApp", true));
        } catch (Exception ignored) {
            value = defaults();
        }
        try {
            ObjectNode node = json.createObjectNode();
            node.put("enabled", value.enabled());
            node.put("widgetEnabled", value.widgetEnabled());
            node.put("guestAppEnabled", value.guestAppEnabled());
            node.put("exactTimeEnabled", value.exactTimeEnabled());
            node.put("flexibleWindowsEnabled", value.flexibleWindowsEnabled());
            node.put("employeePreferenceEnabled", value.employeePreferenceEnabled());
            node.put("autoOfferEnabled", value.autoOfferEnabled());
            node.put("offerValidityMinutes", value.offerValidityMinutes());
            node.put("maxActiveRequestsPerGuest", value.maxActiveRequestsPerGuest());
            node.put("maxRequestedDateRangeDays", value.maxRequestedDateRangeDays());
            node.put("staffManualEntryEnabled", value.staffManualEntryEnabled());
            node.put("closeEquivalentAfterBooking", value.closeEquivalentAfterBooking());
            node.put("notifyEmail", value.notifyEmail());
            node.put("notifySms", value.notifySms());
            node.put("notifyGuestApp", value.notifyGuestApp());
            return json.writeValueAsString(node);
        } catch (Exception ignored) {
            return "{}";
        }
    }

    private static WaitlistSettings defaults() {
        return new WaitlistSettings(true, true, true, true, true, true, false, 15, 5, 30, true, true, true, false, true);
    }

    private static boolean bool(JsonNode node, String key, boolean fallback) {
        JsonNode value = node == null ? null : node.get(key);
        return value == null || value.isNull() ? fallback : value.asBoolean(fallback);
    }

    private static int integer(JsonNode node, String key, int fallback, int min, int max) {
        JsonNode value = node == null ? null : node.get(key);
        int resolved = value == null || value.isNull() ? fallback : value.asInt(fallback);
        return Math.max(min, Math.min(max, resolved));
    }
}
