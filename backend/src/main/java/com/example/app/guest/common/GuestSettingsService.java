package com.example.app.guest.common;

import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.GlobalPaymentProviderService;
import com.example.app.settings.SettingKey;
import com.example.app.settings.TenantReservationRulesService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

@Service
public class GuestSettingsService {
    private static final ObjectMapper JSON = new ObjectMapper();
    private final AppSettingRepository settings;
    private final GlobalPaymentProviderService globalPaymentProviders;
    private final TenantReservationRulesService reservationRulesService;

    @Autowired
    public GuestSettingsService(
            AppSettingRepository settings,
            GlobalPaymentProviderService globalPaymentProviders,
            TenantReservationRulesService reservationRulesService
    ) {
        this.settings = settings;
        this.globalPaymentProviders = globalPaymentProviders;
        this.reservationRulesService = reservationRulesService;
    }

    /** Backwards-compatible constructor for unit tests. */
    public GuestSettingsService(AppSettingRepository settings, GlobalPaymentProviderService globalPaymentProviders) {
        this(settings, globalPaymentProviders, null);
    }

    public GuestPublicSettings publicSettings(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        JsonNode root = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        boolean enabled = root.path("guestAppEnabled").asBoolean(true);
        boolean billingEnabled = settingEnabled(values, SettingKey.BILLING_ENABLED, true);
        boolean inboxEnabled = enabled && root.path("inboxEnabled").asBoolean(true);
        String tenantType = normalizeTenantType(firstNonBlank(
                textOrNull(values.get(SettingKey.MODULE_CONFIG_TYPE.name())),
                textOrNull(root.path("tenantType"))
        ));
        String cardImageUrl = textOrNull(root.path("cardImageUrl"));
        String companyLogoUrl = textOrNull(values.get(SettingKey.COMPANY_LOGO_URL.name()));
        String iconImageUrl = textOrNull(root.path("iconImageUrl"));
        String companyStreet = textOrNull(values.get(SettingKey.COMPANY_ADDRESS.name()));
        String companyPostal = textOrNull(values.get(SettingKey.COMPANY_POSTAL_CODE.name()));
        String companyCity = textOrNull(values.get(SettingKey.COMPANY_CITY.name()));
        String physicalStreet = firstNonBlank(
                textOrNull(values.get(SettingKey.COMPANY_PHYSICAL_ADDRESS.name())),
                companyStreet
        );
        String physicalPostal = firstNonBlank(
                textOrNull(values.get(SettingKey.COMPANY_PHYSICAL_POSTAL_CODE.name())),
                companyPostal
        );
        String physicalCity = firstNonBlank(
                textOrNull(values.get(SettingKey.COMPANY_PHYSICAL_CITY.name())),
                companyCity
        );
        String formattedAddress = firstNonBlank(
                formatCompanyAddressLine(physicalStreet, physicalPostal, physicalCity),
                formatCompanyAddressLine(companyStreet, companyPostal, companyCity)
        );
        String invoiceCompanyName = textOrNull(values.get(SettingKey.COMPANY_NAME.name()));
        String companyPhone = textOrNull(values.get(SettingKey.COMPANY_TELEPHONE.name()));
        String defaultLanguage = root.path("defaultLanguage").asText("sl");
        TenantReservationRulesService.TenantReservationRules reservationRules = TenantReservationRulesService.resolve(values);
        boolean employeeSelectionStep = reservationRules.employeeSelectionAllowed();
        boolean useEmployeeContact = root.path("useEmployeeContact").asBoolean(false);
        boolean cancellationAllowed = reservationRules.cancellationAllowed();
        boolean modificationAllowed = reservationRules.modificationAllowed();
        boolean multipleServicesEnabled = root.path("multipleServicesEnabled").asBoolean(false);
        return new GuestPublicSettings(
                enabled, physicalCity, companyPhone, formattedAddress, invoiceCompanyName, defaultLanguage,
                employeeSelectionStep, useEmployeeContact, billingEnabled, inboxEnabled, tenantType,
                cardImageUrl, companyLogoUrl, iconImageUrl, cancellationAllowed, modificationAllowed,
                multipleServicesEnabled
        );
    }

    public Boolean billingEnabled(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        return settingEnabled(values, SettingKey.BILLING_ENABLED, true);
    }

    public boolean inboxEnabled(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        JsonNode root = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        return root.path("guestAppEnabled").asBoolean(true) && root.path("inboxEnabled").asBoolean(true);
    }

    public boolean advanceBillingEnabled(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        return settingEnabled(values, SettingKey.BILLING_ENABLED, true)
                && settingEnabled(values, SettingKey.BILLING_ADVANCE_ENABLED, true);
    }

    public boolean entitlementsEnabled(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        return settingEnabled(values, SettingKey.ENTITLEMENTS_ENABLED, true);
    }

    public boolean giftCardsEnabled(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        return settingEnabled(values, SettingKey.ENTITLEMENTS_ENABLED, true)
                && settingEnabled(values, SettingKey.BILLING_ENABLED, true)
                && settingEnabled(values, SettingKey.BILLING_GIFT_CARDS_ENABLED, false);
    }

    /**
     * Runtime payment methods enabled for the tenant in the guest app.
     * Returned values are runtime ids: {@code CARD}, {@code BANK_TRANSFER}, {@code PAYPAL}, {@code GIFT_CARD}.
     * Legacy config ids (cash, card_on_location) are filtered out. Missing or legacy-only config
     * keeps the full default set, while an explicitly saved empty array means “none”.
     */
    public List<String> acceptedPaymentMethods(Long companyId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        if (!settingEnabled(values, SettingKey.BILLING_ENABLED, true)) {
            return List.of();
        }
        JsonNode root = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        boolean giftCardsEnabled = settingEnabled(values, SettingKey.ENTITLEMENTS_ENABLED, true)
                && settingEnabled(values, SettingKey.BILLING_GIFT_CARDS_ENABLED, false);
        List<String> accepted = parseAcceptedPaymentMethods(root.path("acceptedPaymentMethodIds"));
        var capabilities = tenantPaymentCapabilities(values);
        return applyGlobalProviderCapabilities(accepted, capabilities, giftCardsEnabled);
    }

    static List<String> parseAcceptedPaymentMethods(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD");
        }
        if (node.size() == 0) {
            // An explicitly saved empty array means that no payment method is
            // available in this booking channel.
            return List.of();
        }
        Set<String> out = new LinkedHashSet<>();
        for (JsonNode entry : node) {
            String runtime = mapConfigIdToRuntimeType(entry.asText());
            if (runtime != null) {
                out.add(runtime);
            }
        }
        // Invalid legacy-only values should retain the previous safe defaults.
        return out.isEmpty()
                ? List.of("CARD", "BANK_TRANSFER", "PAYPAL", "GIFT_CARD")
                : new ArrayList<>(out);
    }

    private GlobalPaymentProviderService.ProviderCapabilities tenantPaymentCapabilities(Map<String, String> values) {
        var global = globalPaymentProviders.capabilities();
        boolean tenantStripeEnabled = settingEnabled(values, SettingKey.BILLING_ONLINE_CARD_PAYMENTS_ENABLED, true);
        return new GlobalPaymentProviderService.ProviderCapabilities(
                global.stripeEnabled() && tenantStripeEnabled,
                global.paypalEnabled()
        );
    }

    public static List<String> applyGlobalProviderCapabilities(
            List<String> accepted,
            GlobalPaymentProviderService.ProviderCapabilities capabilities
    ) {
        return applyGlobalProviderCapabilities(accepted, capabilities, true);
    }

    public static List<String> applyGlobalProviderCapabilities(
            List<String> accepted,
            GlobalPaymentProviderService.ProviderCapabilities capabilities,
            boolean giftCardsEnabled
    ) {
        if (accepted != null && accepted.isEmpty()) {
            return List.of();
        }
        List<String> filtered = (accepted == null ? List.<String>of() : accepted).stream()
                .filter(method -> !"CARD".equals(method) || capabilities.stripeEnabled())
                .filter(method -> !"PAYPAL".equals(method) || capabilities.paypalEnabled())
                .filter(method -> giftCardsEnabled || !"GIFT_CARD".equals(method))
                .toList();
        if (!filtered.isEmpty()) return filtered;
        List<String> fallback = new ArrayList<>();
        if (capabilities.stripeEnabled()) fallback.add("CARD");
        fallback.add("BANK_TRANSFER");
        if (capabilities.paypalEnabled()) fallback.add("PAYPAL");
        if (giftCardsEnabled) fallback.add("GIFT_CARD");
        return fallback;
    }

    private static String mapConfigIdToRuntimeType(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (value) {
            case "online_card", "card" -> "CARD";
            case "bank_transfer" -> "BANK_TRANSFER";
            case "paypal" -> "PAYPAL";
            case "gift_card" -> "GIFT_CARD";
            default -> null;
        };
    }

    public GuestBookingRules bookingRules(Long companyId) {
        return bookingRules(companyId, null);
    }

    public GuestBookingRules bookingRules(Long companyId, Long locationId) {
        Map<String, String> values = settings.findAllByCompanyId(companyId).stream()
                .collect(Collectors.toMap(s -> s.getKey(), s -> s.getValue(), (a, b) -> b));
        JsonNode root = parse(values.get(SettingKey.GUEST_BOOKING_RULES_JSON.name()));
        JsonNode guestAppRoot = parse(values.get(SettingKey.GUEST_APP_SETTINGS_JSON.name()));
        TenantReservationRulesService.TenantReservationRules reservationRules = reservationRulesService == null
                ? TenantReservationRulesService.resolve(values)
                : reservationRulesService.resolve(companyId, locationId);
        boolean billingEnabled = settingEnabled(values, SettingKey.BILLING_ENABLED, true);
        boolean advanceBillingEnabled = billingEnabled && settingEnabled(values, SettingKey.BILLING_ADVANCE_ENABLED, true);
        if (!billingEnabled || !advanceBillingEnabled) {
            return new GuestBookingRules(
                    reservationRules.cancelUntilHours(),
                    reservationRules.rescheduleUntilHours(),
                    root.path("lateCancelConsumesCredit").asBoolean(true),
                    root.path("noShowConsumesCredit").asBoolean(true),
                    false,
                    false,
                    List.of(),
                    List.of(),
                    List.of(),
                    false,
                    "none",
                    normalizeDepositPercent(root.path("depositPercent").asInt(20)),
                    reservationRules.minBookingNoticeMinutes(),
                    reservationRules.maxAdvanceBookingDays(),
                    reservationRules.employeeSelectionAllowed(),
                    reservationRules.cancellationAllowed(),
                    reservationRules.modificationAllowed(),
                    reservationRules.noShowMode(),
                    reservationRules.noShowAfterMinutes()
            );
        }
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
        boolean giftCardsEnabled = settingEnabled(values, SettingKey.ENTITLEMENTS_ENABLED, true)
                && settingEnabled(values, SettingKey.BILLING_GIFT_CARDS_ENABLED, false);
        return new GuestBookingRules(
                reservationRules.cancelUntilHours(),
                reservationRules.rescheduleUntilHours(),
                root.path("lateCancelConsumesCredit").asBoolean(true),
                root.path("noShowConsumesCredit").asBoolean(true),
                root.path("sameDayBankTransferAllowed").asBoolean(false),
                root.path("bankTransferReservesSlot").asBoolean(false),
                filterGiftCardProductTypes(readTextArray(root.path("allowBankTransferFor"), List.of("PACK", "MEMBERSHIP", "GIFT_CARD")), giftCardsEnabled),
                filterGiftCardProductTypes(readTextArray(root.path("allowCardFor"), List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP", "GIFT_CARD", "COURSE")), giftCardsEnabled),
                filterGiftCardProductTypes(readTextArray(root.path("allowPaypalFor"), List.of("SESSION_SINGLE", "CLASS_TICKET", "PACK", "MEMBERSHIP", "GIFT_CARD", "COURSE")), giftCardsEnabled),
                requireOnlinePayment,
                paymentRequirement,
                depositPercent,
                reservationRules.minBookingNoticeMinutes(),
                reservationRules.maxAdvanceBookingDays(),
                reservationRules.employeeSelectionAllowed(),
                reservationRules.cancellationAllowed(),
                reservationRules.modificationAllowed(),
                reservationRules.noShowMode(),
                reservationRules.noShowAfterMinutes()
        );
    }

    private static boolean settingEnabled(Map<String, String> values, SettingKey key, boolean defaultValue) {
        String raw = values == null ? null : values.get(key.name());
        if (raw == null || raw.isBlank()) return defaultValue;
        if ("true".equalsIgnoreCase(raw.trim())) return true;
        if ("false".equalsIgnoreCase(raw.trim())) return false;
        return defaultValue;
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

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
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
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim().toLowerCase(java.util.Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (value) {
            case "salon" -> "hair_salon";
            case "gym", "personal_training" -> "fitness_personal_training";
            case "therapy" -> "psychology_counselling";
            case "spa" -> "spa_sauna";
            case "hair_salon", "beauty_salon", "massage", "spa_sauna", "tattooing_piercing",
                 "fitness_personal_training", "physical_therapy", "psychology_counselling",
                 "yoga_pilates", "pet_services", "education_coaching", "other" -> value;
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

    private static List<String> filterGiftCardProductTypes(List<String> values, boolean giftCardsEnabled) {
        if (giftCardsEnabled) return values;
        return (values == null ? List.<String>of() : values).stream()
                .filter(value -> !"GIFT_CARD".equalsIgnoreCase(value))
                .toList();
    }

    private static String normalizePaymentRequirement(String raw, boolean requireOnlinePayment) {
        if (raw == null || raw.isBlank()) {
            return requireOnlinePayment ? "full" : "none";
        }
        String value = raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (value) {
            case "deposit", "full", "none" -> value;
            default -> requireOnlinePayment ? "full" : "none";
        };
    }

    private static int normalizeDepositPercent(int value) {
        if (value < 1) return 1;
        return Math.min(value, 100);
    }

    public record GuestPublicSettings(
            boolean guestAppEnabled,
            String companyCity,
            String companyPhone,
            String companyAddress,
            String invoiceCompanyName,
            String defaultLanguage,
            boolean employeeSelectionStep,
            boolean useEmployeeContact,
            boolean billingEnabled,
            boolean inboxEnabled,
            String tenantType,
            String cardImageUrl,
            String companyLogoUrl,
            String iconImageUrl,
            boolean cancellationAllowed,
            boolean modificationAllowed,
            boolean multipleServicesEnabled
    ) {
        /** Convenience constructor for callers that do not need multi-service configuration. */
        public GuestPublicSettings(
                boolean guestAppEnabled,
                String companyCity,
                String companyPhone,
                String companyAddress,
                String invoiceCompanyName,
                String defaultLanguage,
                boolean employeeSelectionStep,
                boolean useEmployeeContact,
                boolean billingEnabled,
                boolean inboxEnabled,
                String tenantType,
                String cardImageUrl,
                String companyLogoUrl,
                String iconImageUrl,
                boolean cancellationAllowed,
                boolean modificationAllowed
        ) {
            this(
                    guestAppEnabled, companyCity, companyPhone, companyAddress, invoiceCompanyName, defaultLanguage,
                    employeeSelectionStep, useEmployeeContact, billingEnabled, inboxEnabled, tenantType,
                    cardImageUrl, companyLogoUrl, iconImageUrl, cancellationAllowed, modificationAllowed, false
            );
        }
    }

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
            int depositPercent,
            int minBookingNoticeMinutes,
            int maxAdvanceBookingDays,
            boolean employeeSelectionAllowed,
            boolean cancellationAllowed,
            boolean modificationAllowed,
            String noShowMode,
            int noShowAfterMinutes
    ) {
        public GuestBookingRules(
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
        ) {
            this(
                    cancelUntilHours,
                    rescheduleUntilHours,
                    lateCancelConsumesCredit,
                    noShowConsumesCredit,
                    sameDayBankTransferAllowed,
                    bankTransferReservesSlot,
                    allowBankTransferFor,
                    allowCardFor,
                    allowPaypalFor,
                    requireOnlinePayment,
                    paymentRequirement,
                    depositPercent,
                    TenantReservationRulesService.DEFAULT_MIN_BOOKING_NOTICE_MINUTES,
                    TenantReservationRulesService.DEFAULT_MAX_ADVANCE_BOOKING_DAYS,
                    TenantReservationRulesService.DEFAULT_EMPLOYEE_SELECTION_ALLOWED,
                    TenantReservationRulesService.DEFAULT_CANCELLATION_ALLOWED,
                    TenantReservationRulesService.DEFAULT_MODIFICATION_ALLOWED,
                    TenantReservationRulesService.DEFAULT_NO_SHOW_MODE,
                    TenantReservationRulesService.DEFAULT_NO_SHOW_AFTER_MINUTES
            );
        }
    }
}
