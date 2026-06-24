package com.example.app.settings;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/**
 * Tenant-wide reservation rules shared by the guest app, website widget and
 * reservation automation. The dedicated TENANT_RESERVATION_RULES_JSON setting
 * is canonical; legacy guest/widget JSON fields are used as fallback and are
 * also synchronized by SettingsController when the canonical setting is saved.
 */
@Service
public class TenantReservationRulesService {
    private static final ObjectMapper JSON = new ObjectMapper();

    public static final int DEFAULT_MIN_BOOKING_NOTICE_MINUTES = 120;
    public static final int DEFAULT_MAX_ADVANCE_BOOKING_DAYS = 60;
    public static final int DEFAULT_RESCHEDULE_UNTIL_HOURS = 12;
    public static final int DEFAULT_CANCEL_UNTIL_HOURS = 24;
    public static final boolean DEFAULT_EMPLOYEE_SELECTION_ALLOWED = false;
    public static final boolean DEFAULT_CANCELLATION_ALLOWED = true;
    public static final boolean DEFAULT_MODIFICATION_ALLOWED = true;
    public static final String NO_SHOW_MANUAL = "MANUAL";
    public static final String NO_SHOW_AUTOMATIC = "AUTOMATIC";
    public static final String DEFAULT_NO_SHOW_MODE = NO_SHOW_MANUAL;
    public static final int DEFAULT_NO_SHOW_AFTER_MINUTES = 15;

    private final AppSettingRepository settings;

    public TenantReservationRulesService(AppSettingRepository settings) {
        this.settings = settings;
    }

    public TenantReservationRules resolve(Long companyId) {
        Map<String, String> values = companyId == null
                ? Map.of()
                : settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(AppSetting::getKey, AppSetting::getValue, (a, b) -> b));
        return resolve(values);
    }

    public static TenantReservationRules resolve(Map<String, String> values) {
        Map<String, String> source = values == null ? Map.of() : values;
        JsonNode canonical = parse(source.get(SettingKey.TENANT_RESERVATION_RULES_JSON.name()));
        JsonNode guestRules = parse(source.get(SettingKey.GUEST_BOOKING_RULES_JSON.name()));
        JsonNode websiteRules = parse(source.get(SettingKey.WEBSITE_BOOKING_RULES_JSON.name()));
        JsonNode guestApp = parse(source.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        JsonNode website = parse(source.get(SettingKey.WEBSITE_WIDGET_SETTINGS_JSON.name()));

        int minNotice = normalizeMinutes(firstText(
                canonical.path("minBookingNoticeMinutes"),
                canonical.path("minBookingNotice"),
                websiteRules.path("minBookingNoticeMinutes"),
                websiteRules.path("minBookingNotice"),
                guestRules.path("minBookingNoticeMinutes"),
                guestRules.path("minBookingNotice")
        ), DEFAULT_MIN_BOOKING_NOTICE_MINUTES, 0, 60 * 24 * 30);
        int maxAdvance = normalizeInteger(firstText(
                canonical.path("maxAdvanceBookingDays"),
                canonical.path("maxAdvanceDays"),
                websiteRules.path("maxAdvanceBookingDays"),
                websiteRules.path("maxAdvanceDays"),
                guestRules.path("maxAdvanceBookingDays"),
                guestRules.path("maxAdvanceDays")
        ), DEFAULT_MAX_ADVANCE_BOOKING_DAYS, 1, 730);
        int rescheduleHours = normalizeInteger(firstText(
                canonical.path("rescheduleUntilHours"),
                websiteRules.path("rescheduleUntilHours"),
                guestRules.path("rescheduleUntilHours")
        ), DEFAULT_RESCHEDULE_UNTIL_HOURS, 0, 24 * 90);
        int cancelHours = normalizeInteger(firstText(
                canonical.path("cancelUntilHours"),
                canonical.path("freeCancelUntilHours"),
                websiteRules.path("cancelUntilHours"),
                websiteRules.path("freeCancelUntilHours"),
                guestRules.path("cancelUntilHours"),
                guestRules.path("freeCancelUntilHours")
        ), DEFAULT_CANCEL_UNTIL_HOURS, 0, 24 * 90);
        boolean employeeSelectionAllowed = firstBoolean(
                DEFAULT_EMPLOYEE_SELECTION_ALLOWED,
                canonical.path("employeeSelectionAllowed"),
                canonical.path("employeeSelectionStep"),
                website.path("employeeSelectionAllowed"),
                website.path("employeeSelectionStep"),
                guestApp.path("employeeSelectionAllowed"),
                guestApp.path("employeeSelectionStep")
        );
        boolean cancellationAllowed = firstBoolean(
                DEFAULT_CANCELLATION_ALLOWED,
                canonical.path("cancellationAllowed"),
                canonical.path("cancellationEnabled"),
                guestRules.path("cancellationAllowed"),
                guestRules.path("cancellationEnabled"),
                guestApp.path("cancellationAllowed"),
                guestApp.path("cancellationEnabled")
        );
        boolean modificationAllowed = firstBoolean(
                DEFAULT_MODIFICATION_ALLOWED,
                canonical.path("modificationAllowed"),
                canonical.path("modificationEnabled"),
                guestRules.path("modificationAllowed"),
                guestRules.path("modificationEnabled")
        );
        String noShowMode = normalizeNoShowMode(firstText(
                canonical.path("noShowMode"),
                canonical.path("noShowRule"),
                guestRules.path("noShowMode"),
                guestRules.path("noShowRule")
        ));
        int noShowAfterMinutes = normalizeInteger(firstText(
                canonical.path("noShowAfterMinutes"),
                guestRules.path("noShowAfterMinutes")
        ), DEFAULT_NO_SHOW_AFTER_MINUTES, 0, 24 * 60);

        return new TenantReservationRules(
                minNotice,
                maxAdvance,
                rescheduleHours,
                cancelHours,
                employeeSelectionAllowed,
                cancellationAllowed,
                modificationAllowed,
                noShowMode,
                noShowAfterMinutes
        );
    }

    public static String normalizeJson(String raw) {
        return toJson(resolve(Map.of(SettingKey.TENANT_RESERVATION_RULES_JSON.name(), raw == null ? "" : raw)));
    }

    public static String toJson(TenantReservationRules rules) {
        try {
            ObjectNode node = JSON.createObjectNode();
            node.put("minBookingNoticeMinutes", rules.minBookingNoticeMinutes());
            node.put("maxAdvanceBookingDays", rules.maxAdvanceBookingDays());
            node.put("rescheduleUntilHours", rules.rescheduleUntilHours());
            node.put("cancelUntilHours", rules.cancelUntilHours());
            node.put("employeeSelectionAllowed", rules.employeeSelectionAllowed());
            node.put("cancellationAllowed", rules.cancellationAllowed());
            node.put("modificationAllowed", rules.modificationAllowed());
            node.put("noShowMode", normalizeNoShowMode(rules.noShowMode()));
            node.put("noShowAfterMinutes", rules.noShowAfterMinutes());
            return JSON.writeValueAsString(node);
        } catch (Exception ignored) {
            return defaultJson();
        }
    }

    public static String defaultJson() {
        return toJson(defaultRules());
    }

    public static TenantReservationRules defaultRules() {
        return new TenantReservationRules(
                DEFAULT_MIN_BOOKING_NOTICE_MINUTES,
                DEFAULT_MAX_ADVANCE_BOOKING_DAYS,
                DEFAULT_RESCHEDULE_UNTIL_HOURS,
                DEFAULT_CANCEL_UNTIL_HOURS,
                DEFAULT_EMPLOYEE_SELECTION_ALLOWED,
                DEFAULT_CANCELLATION_ALLOWED,
                DEFAULT_MODIFICATION_ALLOWED,
                DEFAULT_NO_SHOW_MODE,
                DEFAULT_NO_SHOW_AFTER_MINUTES
        );
    }

    public static String mergeIntoGuestBookingRulesJson(String raw, TenantReservationRules rules) {
        ObjectNode node = objectNode(raw);
        node.put("minBookingNoticeMinutes", rules.minBookingNoticeMinutes());
        node.put("minBookingNotice", rules.minBookingNoticeMinutes() + " minutes");
        node.put("maxAdvanceBookingDays", rules.maxAdvanceBookingDays());
        node.put("maxAdvanceDays", String.valueOf(rules.maxAdvanceBookingDays()));
        node.put("rescheduleUntilHours", rules.rescheduleUntilHours());
        node.put("cancelUntilHours", rules.cancelUntilHours());
        node.put("freeCancelUntilHours", String.valueOf(rules.cancelUntilHours()));
        node.put("cancellationEnabled", rules.cancellationAllowed());
        node.put("cancellationAllowed", rules.cancellationAllowed());
        node.put("modificationAllowed", rules.modificationAllowed());
        node.put("noShowMode", normalizeNoShowMode(rules.noShowMode()));
        node.put("noShowAfterMinutes", rules.noShowAfterMinutes());
        return write(node);
    }

    public static String mergeIntoWebsiteBookingRulesJson(String raw, TenantReservationRules rules) {
        ObjectNode node = objectNode(raw);
        node.put("minBookingNoticeMinutes", rules.minBookingNoticeMinutes());
        node.put("minBookingNotice", rules.minBookingNoticeMinutes() + " minutes");
        node.put("maxAdvanceBookingDays", rules.maxAdvanceBookingDays());
        node.put("maxAdvanceDays", String.valueOf(rules.maxAdvanceBookingDays()));
        node.put("rescheduleUntilHours", rules.rescheduleUntilHours());
        node.put("cancelUntilHours", rules.cancelUntilHours());
        node.put("freeCancelUntilHours", String.valueOf(rules.cancelUntilHours()));
        return write(node);
    }

    public static String mergeIntoGuestAppSettingsJson(String raw, TenantReservationRules rules) {
        ObjectNode node = objectNode(raw);
        node.put("employeeSelectionStep", rules.employeeSelectionAllowed());
        node.put("employeeSelectionAllowed", rules.employeeSelectionAllowed());
        return write(node);
    }

    public static String mergeIntoWebsiteWidgetSettingsJson(String raw, TenantReservationRules rules) {
        ObjectNode node = objectNode(raw);
        node.put("employeeSelectionStep", rules.employeeSelectionAllowed());
        node.put("employeeSelectionAllowed", rules.employeeSelectionAllowed());
        return write(node);
    }

    public static boolean isAutomaticNoShow(TenantReservationRules rules) {
        return rules != null && NO_SHOW_AUTOMATIC.equals(normalizeNoShowMode(rules.noShowMode()));
    }

    public static boolean slotAllowed(TenantReservationRules rules, LocalDateTime slotStart, ZoneId zoneId, LocalDateTime now) {
        if (rules == null || slotStart == null || zoneId == null || now == null) return false;
        LocalDate today = now.toLocalDate();
        if (slotStart.toLocalDate().isBefore(today)) return false;
        if (slotStart.toLocalDate().isAfter(today.plusDays(rules.maxAdvanceBookingDays()))) return false;
        LocalDateTime earliest = now.plusMinutes(rules.minBookingNoticeMinutes());
        return !slotStart.isBefore(earliest);
    }

    public static int normalizeInteger(String raw, int fallback, int min, int max) {
        try {
            int value = Integer.parseInt(raw == null ? "" : raw.trim());
            if (value < min) return min;
            return Math.min(value, max);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    public static int normalizeMinutes(String raw, int fallback, int min, int max) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        if (value.isBlank()) return fallback;
        try {
            if (value.matches("^-?\\d+$")) {
                return clamp(Integer.parseInt(value), min, max);
            }
            String numberText = value.replace(',', '.').replaceAll("[^0-9.]+.*$", "");
            double number = Double.parseDouble(numberText);
            int multiplier = 1;
            if (value.contains("day") || value.contains("dni") || value.contains("dan") || value.contains("d ")) {
                multiplier = 60 * 24;
            } else if (value.contains("hour") || value.contains("ura") || value.contains("uri") || value.contains("ur") || value.contains("h")) {
                multiplier = 60;
            } else if (value.contains("minute") || value.contains("min")) {
                multiplier = 1;
            }
            return clamp((int) Math.round(number * multiplier), min, max);
        } catch (Exception ignored) {
            return fallback;
        }
    }

    public static String normalizeNoShowMode(String raw) {
        String value = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (value) {
            case "AUTO", "AUTOMATIC", "AUTO_AFTER_START", "AUTOMATIC_AFTER_START" -> NO_SHOW_AUTOMATIC;
            default -> NO_SHOW_MANUAL;
        };
    }

    private static int clamp(int value, int min, int max) {
        if (value < min) return min;
        return Math.min(value, max);
    }

    private static JsonNode parse(String raw) {
        if (raw == null || raw.isBlank()) return JSON.createObjectNode();
        try {
            return JSON.readTree(raw);
        } catch (Exception ignored) {
            return JSON.createObjectNode();
        }
    }

    private static ObjectNode objectNode(String raw) {
        JsonNode node = parse(raw);
        return node != null && node.isObject() ? (ObjectNode) node.deepCopy() : JSON.createObjectNode();
    }

    private static String write(ObjectNode node) {
        try {
            return JSON.writeValueAsString(node);
        } catch (Exception ignored) {
            return "{}";
        }
    }

    private static String firstText(JsonNode... nodes) {
        if (nodes == null) return null;
        for (JsonNode node : nodes) {
            if (node == null || node.isMissingNode() || node.isNull()) continue;
            if (node.isNumber()) return node.asText();
            if (node.isTextual() && !node.asText().isBlank()) return node.asText();
            if (node.isBoolean()) return node.asBoolean() ? "true" : "false";
        }
        return null;
    }

    private static boolean firstBoolean(boolean fallback, JsonNode... nodes) {
        if (nodes == null) return fallback;
        for (JsonNode node : nodes) {
            if (node == null || node.isMissingNode() || node.isNull()) continue;
            if (node.isBoolean()) return node.asBoolean();
            if (node.isTextual()) {
                String raw = node.asText();
                if ("true".equalsIgnoreCase(raw)) return true;
                if ("false".equalsIgnoreCase(raw)) return false;
            }
        }
        return fallback;
    }

    public record TenantReservationRules(
            int minBookingNoticeMinutes,
            int maxAdvanceBookingDays,
            int rescheduleUntilHours,
            int cancelUntilHours,
            boolean employeeSelectionAllowed,
            boolean cancellationAllowed,
            boolean modificationAllowed,
            String noShowMode,
            int noShowAfterMinutes
    ) {}
}
