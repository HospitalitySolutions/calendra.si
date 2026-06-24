package com.example.app.settings;

import com.example.app.company.PlatformTenantAccountLinkService;
import com.example.app.files.TenantFileS3Service;
import java.util.Locale;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import com.example.app.user.User;
import com.example.app.user.Role;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.servlet.support.ServletUriComponentsBuilder;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/settings")
public class SettingsController {
    private static final String MASKED_SECRET_VALUE = "••••••••";
    private static final Set<SettingKey> SECRET_KEYS = EnumSet.of(
            SettingKey.FISCAL_CERTIFICATE_PASSWORD,
            SettingKey.INBOX_INFOBIP_API_KEY,
            SettingKey.INBOX_WHATSAPP_ACCESS_TOKEN,
            SettingKey.INBOX_WHATSAPP_APP_SECRET,
            SettingKey.INBOX_VIBER_BOT_TOKEN,
            SettingKey.WIDGET_TURNSTILE_SECRET_KEY
    );
    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Set<String> MODULE_VISIBILITY_SETTING_KEYS = Set.of(
            SettingKey.SPACES_ENABLED.name(),
            SettingKey.TYPES_ENABLED.name(),
            SettingKey.COURSES_ENABLED.name(),
            SettingKey.BOOKABLE_ENABLED.name(),
            SettingKey.NO_SHOW_ENABLED.name(),
            SettingKey.ONLINE_SESSION_BOOKING_ENABLED.name(),
            SettingKey.WEBSITE_WIDGET_ENABLED.name(),
            SettingKey.AI_BOOKING_ENABLED.name(),
            SettingKey.PERSONAL_ENABLED.name(),
            SettingKey.TODOS_ENABLED.name(),
            SettingKey.MULTIPLE_SESSIONS_PER_SPACE_ENABLED.name(),
            SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED.name(),
            SettingKey.GROUP_BOOKING_ENABLED.name(),
            SettingKey.BILLING_ENABLED.name(),
            SettingKey.BILLING_INVOICES_ENABLED.name(),
            SettingKey.BILLING_ONLINE_CARD_PAYMENTS_ENABLED.name(),
            SettingKey.BILLING_BANK_TRANSFER_ENABLED.name(),
            SettingKey.BILLING_PAYPAL_ENABLED.name(),
            SettingKey.BILLING_GIFT_CARDS_ENABLED.name(),
            SettingKey.BILLING_ADVANCE_ENABLED.name(),
            SettingKey.COMMUNICATION_ENABLED.name(),
            SettingKey.INBOX_ENABLED.name(),
            SettingKey.NOTIFICATIONS_ENABLED.name(),
            SettingKey.NOTIFICATIONS_EMAIL_ALERTS_ENABLED.name(),
            SettingKey.NOTIFICATIONS_SMS_ALERTS_ENABLED.name(),
            SettingKey.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED.name(),
            SettingKey.NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED.name(),
            SettingKey.GOOGLE_CALENDAR_MODULE_ENABLED.name(),
            SettingKey.SCANNER_MODULE_ENABLED.name(),
            SettingKey.WHATSAPP_MODULE_ENABLED.name(),
            SettingKey.VIBER_MODULE_ENABLED.name(),
            SettingKey.SECURITY_MODULE_ENABLED.name(),
            SettingKey.SECURITY_SESSION_SECURITY_ENABLED.name(),
            SettingKey.SECURITY_PASSKEYS_ENABLED.name(),
            SettingKey.SECURITY_API_INTEGRATIONS_ENABLED.name()
    );

    private static final Set<SettingKey> GENERAL_SETTING_KEYS = EnumSet.of(
            SettingKey.TENANT_DEFAULT_LANGUAGE,
            SettingKey.TENANT_TIME_ZONE,
            SettingKey.TENANT_CURRENCY,
            SettingKey.TENANT_DATE_FORMAT,
            SettingKey.TENANT_TIME_FORMAT,
            SettingKey.TENANT_WEEK_START_DAY,
            SettingKey.TENANT_PUBLIC_COMPANY_NAME,
            SettingKey.TENANT_CONTACT_PHONE,
            SettingKey.TENANT_CONTACT_EMAIL,
            SettingKey.TENANT_CONTACT_WEBSITE,
            SettingKey.TENANT_CONTACT_ADDRESS,
            SettingKey.TENANT_BRAND_LOGO_BASE64,
            SettingKey.TENANT_BRAND_PRIMARY_COLOR,
            SettingKey.TENANT_BRAND_ACCENT_COLOR
    );

    private final AppSettingRepository repository;
    private final SettingsCryptoService crypto;
    private final TenantFileS3Service fileStorage;
    private final GlobalPaymentProviderService globalPaymentProviders;
    private final GlobalConsumablesFeatureService globalConsumablesFeatureService;
    private final PlatformTenantAccountLinkService platformTenantAccountLinkService;
    private final CourseModuleAccessService courseModuleAccessService;
    private final TenantSmsQuotaService tenantSmsQuotaService;
    private final TenantGeneralSettingsService tenantGeneralSettingsService;

    @Autowired
    public SettingsController(
            AppSettingRepository repository,
            SettingsCryptoService crypto,
            TenantFileS3Service fileStorage,
            GlobalPaymentProviderService globalPaymentProviders,
            GlobalConsumablesFeatureService globalConsumablesFeatureService,
            PlatformTenantAccountLinkService platformTenantAccountLinkService,
            CourseModuleAccessService courseModuleAccessService,
            TenantSmsQuotaService tenantSmsQuotaService,
            TenantGeneralSettingsService tenantGeneralSettingsService
    ) {
        this.repository = repository;
        this.crypto = crypto;
        this.fileStorage = fileStorage;
        this.globalPaymentProviders = globalPaymentProviders;
        this.globalConsumablesFeatureService = globalConsumablesFeatureService;
        this.platformTenantAccountLinkService = platformTenantAccountLinkService;
        this.courseModuleAccessService = courseModuleAccessService;
        this.tenantSmsQuotaService = tenantSmsQuotaService;
        this.tenantGeneralSettingsService = tenantGeneralSettingsService;
    }

    /** Backwards-compatible constructor for older unit tests. Runtime wiring uses the @Autowired constructor above. */
    public SettingsController(
            AppSettingRepository repository,
            SettingsCryptoService crypto,
            TenantFileS3Service fileStorage,
            GlobalPaymentProviderService globalPaymentProviders,
            GlobalConsumablesFeatureService globalConsumablesFeatureService,
            PlatformTenantAccountLinkService platformTenantAccountLinkService
    ) {
        this(repository, crypto, fileStorage, globalPaymentProviders, globalConsumablesFeatureService, platformTenantAccountLinkService, null, null, null);
    }

    public record PaymentProviderCapabilitiesResponse(boolean stripeEnabled, boolean paypalEnabled) {}
    public record ModuleCapabilitiesResponse(boolean consumablesEnabled) {}
    public record SmsQuotaResponse(int quota, int used, int remaining, boolean warning, boolean exhausted) {}

    @GetMapping("/general")
    public TenantGeneralSettingsService.TenantGeneralSettings general(@AuthenticationPrincipal User me) {
        if (me == null || me.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        return resolveGeneralSettings(me.getCompany().getId());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/general")
    @Transactional
    public TenantGeneralSettingsService.TenantGeneralSettings saveGeneral(
            @RequestBody Map<String, String> payload,
            @AuthenticationPrincipal User me
    ) {
        if (me == null || me.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        Long companyId = me.getCompany().getId();
        Map<String, String> normalized = normalizeTenantGeneralSettingsPayload(payload);
        GENERAL_SETTING_KEYS.forEach(key -> {
            if (!normalized.containsKey(key.name())) return;
            var setting = repository.findByCompanyIdAndKey(companyId, key).orElseGet(() -> {
                var ns = new AppSetting();
                ns.setCompany(me.getCompany());
                ns.setKey(key.name());
                return ns;
            });
            setting.setKey(key.name());
            setting.setValue(normalized.getOrDefault(key.name(), ""));
            repository.save(setting);
        });
        return resolveGeneralSettings(companyId);
    }

    @GetMapping("/sms-quota")
    public SmsQuotaResponse smsQuota(@AuthenticationPrincipal User me) {
        if (me == null || me.getCompany() == null || tenantSmsQuotaService == null) {
            return new SmsQuotaResponse(0, 0, 0, false, false);
        }
        TenantSmsQuotaService.SmsQuota quota = tenantSmsQuotaService.quota(me.getCompany().getId());
        return new SmsQuotaResponse(quota.quota(), quota.used(), quota.remaining(), quota.warning(), quota.exhausted());
    }

    @GetMapping
    public Map<String, String> all(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Map<String, String> values = repository.findAllByCompanyId(companyId).stream()
                .filter(s -> isKnownSettingKey(s.getKey()))
                .collect(java.util.stream.Collectors.toMap(
                        AppSetting::getKey,
                        s -> decodeForRead(s.getKey(), s.getValue()),
                        (a, b) -> b,
                        LinkedHashMap::new
                ));

        latestGlobalSettingValue(SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON)
                .ifPresent(v -> values.put(SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON.name(), v));
        applyTenantGeneralSettingDefaults(values);
        if (!isSuperAdmin(me)) {
            applyPlatformModuleVisibilityRules(values);
        }
        return values;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    @Transactional
    public Map<String, String> save(@RequestBody Map<String, String> payload, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Map<String, String> normalizedPayload = normalizeTenantGeneralSettingsPayload(payload);
        if ("false".equalsIgnoreCase(String.valueOf(payload.get(SettingKey.COURSES_ENABLED.name())).trim()) && courseModuleAccessService != null) {
            courseModuleAccessService.assertCanDisable(companyId);
        }
        Arrays.stream(SettingKey.values()).forEach(key -> {
            if (normalizedPayload.containsKey(key.name())) {
                if (key == SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON && !isSuperAdmin(me)) {
                    return;
                }
                String submittedValue = normalizedPayload.get(key.name());
                if (isSecretKey(key) && isMaskedSecretValue(submittedValue)) {
                    return;
                }
                var s = repository.findByCompanyIdAndKey(companyId, key).orElseGet(() -> {
                    var ns = new AppSetting();
                    ns.setCompany(me.getCompany());
                    return ns;
                });
                s.setKey(key.name());
                s.setValue(encodeForSave(key, submittedValue));
                repository.save(s);
            }
        });
        platformTenantAccountLinkService.syncFromTenantSettings(me.getCompany(), normalizedPayload);
        return all(me);
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PostMapping(value = "/guest-app/assets/{assetType}", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public GuestAppAssetUploadResponse uploadGuestAppAsset(
            @PathVariable String assetType,
            @RequestParam("file") MultipartFile file,
            @AuthenticationPrincipal User me
    ) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required.");
        }
        String contentType = file.getContentType() == null ? "" : file.getContentType().trim().toLowerCase(Locale.ROOT);
        if (!contentType.startsWith("image/")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Only image files are allowed.");
        }
        String settingField = normalizeGuestAppAssetField(assetType);
        var stored = fileStorage.uploadGuestAppAsset(me.getCompany(), file);
        String publicUrl = ServletUriComponentsBuilder.fromCurrentContextPath()
                .path("/api/public/widget/guest-assets")
                .queryParam("key", stored.objectKey())
                .toUriString();
        return new GuestAppAssetUploadResponse(settingField, stored.objectKey(), publicUrl, stored.contentType(), stored.sizeBytes());
    }

    @GetMapping("/payment-capabilities")
    public PaymentProviderCapabilitiesResponse paymentCapabilities(@AuthenticationPrincipal User me) {
        var caps = globalPaymentProviders.capabilities();
        return new PaymentProviderCapabilitiesResponse(caps.stripeEnabled(), caps.paypalEnabled());
    }

    @GetMapping("/module-capabilities")
    public ModuleCapabilitiesResponse moduleCapabilities(@AuthenticationPrincipal User me) {
        return new ModuleCapabilitiesResponse(globalConsumablesFeatureService.isEnabledForUser(me));
    }

    private TenantGeneralSettingsService.TenantGeneralSettings resolveGeneralSettings(Long companyId) {
        if (tenantGeneralSettingsService != null) {
            return tenantGeneralSettingsService.resolve(companyId);
        }
        Map<String, String> values = companyId == null
                ? Map.of()
                : repository.findAllByCompanyId(companyId).stream().collect(java.util.stream.Collectors.toMap(
                AppSetting::getKey,
                AppSetting::getValue,
                (a, b) -> b,
                LinkedHashMap::new
        ));
        return TenantGeneralSettingsService.resolve(values);
    }

    private void applyTenantGeneralSettingDefaults(Map<String, String> values) {
        TenantGeneralSettingsService.TenantGeneralSettings general = TenantGeneralSettingsService.resolve(values);
        values.putIfAbsent(SettingKey.TENANT_DEFAULT_LANGUAGE.name(), general.defaultLanguage());
        values.putIfAbsent(SettingKey.TENANT_TIME_ZONE.name(), general.timeZone());
        values.putIfAbsent(SettingKey.TENANT_CURRENCY.name(), general.currency());
        values.putIfAbsent(SettingKey.TENANT_DATE_FORMAT.name(), general.dateFormat());
        values.putIfAbsent(SettingKey.TENANT_TIME_FORMAT.name(), general.timeFormat());
        values.putIfAbsent(SettingKey.TENANT_WEEK_START_DAY.name(), general.weekStartDay());
        values.putIfAbsent(SettingKey.TENANT_PUBLIC_COMPANY_NAME.name(), general.publicCompanyName());
        values.putIfAbsent(SettingKey.TENANT_CONTACT_PHONE.name(), general.contactPhone());
        values.putIfAbsent(SettingKey.TENANT_CONTACT_EMAIL.name(), general.contactEmail());
        values.putIfAbsent(SettingKey.TENANT_CONTACT_WEBSITE.name(), general.contactWebsite());
        values.putIfAbsent(SettingKey.TENANT_CONTACT_ADDRESS.name(), general.contactAddress());
        values.putIfAbsent(SettingKey.TENANT_BRAND_LOGO_BASE64.name(), general.brandLogoBase64());
        values.putIfAbsent(SettingKey.TENANT_BRAND_PRIMARY_COLOR.name(), general.brandPrimaryColor());
        values.putIfAbsent(SettingKey.TENANT_BRAND_ACCENT_COLOR.name(), general.brandAccentColor());
    }

    private Map<String, String> normalizeTenantGeneralSettingsPayload(Map<String, String> payload) {
        Map<String, String> normalized = new LinkedHashMap<>(payload == null ? Map.of() : payload);
        if (normalized.containsKey(SettingKey.TENANT_DEFAULT_LANGUAGE.name())) {
            normalized.put(SettingKey.TENANT_DEFAULT_LANGUAGE.name(),
                    TenantGeneralSettingsService.normalizeLanguage(normalized.get(SettingKey.TENANT_DEFAULT_LANGUAGE.name())));
        }
        if (normalized.containsKey(SettingKey.TENANT_TIME_ZONE.name())) {
            normalized.put(SettingKey.TENANT_TIME_ZONE.name(),
                    TenantGeneralSettingsService.normalizeTimeZone(normalized.get(SettingKey.TENANT_TIME_ZONE.name())));
        }
        if (normalized.containsKey(SettingKey.TENANT_CURRENCY.name())) {
            normalized.put(SettingKey.TENANT_CURRENCY.name(),
                    TenantGeneralSettingsService.normalizeCurrency(normalized.get(SettingKey.TENANT_CURRENCY.name())));
        }
        if (normalized.containsKey(SettingKey.TENANT_DATE_FORMAT.name())) {
            normalized.put(SettingKey.TENANT_DATE_FORMAT.name(),
                    TenantGeneralSettingsService.normalizeDateFormat(normalized.get(SettingKey.TENANT_DATE_FORMAT.name())));
        }
        if (normalized.containsKey(SettingKey.TENANT_TIME_FORMAT.name())) {
            normalized.put(SettingKey.TENANT_TIME_FORMAT.name(),
                    TenantGeneralSettingsService.normalizeTimeFormat(normalized.get(SettingKey.TENANT_TIME_FORMAT.name())));
        }
        if (normalized.containsKey(SettingKey.TENANT_WEEK_START_DAY.name())) {
            normalized.put(SettingKey.TENANT_WEEK_START_DAY.name(),
                    TenantGeneralSettingsService.normalizeWeekStart(normalized.get(SettingKey.TENANT_WEEK_START_DAY.name())));
        }
        if (normalized.containsKey(SettingKey.TENANT_BRAND_PRIMARY_COLOR.name())) {
            normalized.put(SettingKey.TENANT_BRAND_PRIMARY_COLOR.name(),
                    TenantGeneralSettingsService.normalizeHexColor(normalized.get(SettingKey.TENANT_BRAND_PRIMARY_COLOR.name()), "#2563EB"));
        }
        if (normalized.containsKey(SettingKey.TENANT_BRAND_ACCENT_COLOR.name())) {
            normalized.put(SettingKey.TENANT_BRAND_ACCENT_COLOR.name(),
                    TenantGeneralSettingsService.normalizeHexColor(normalized.get(SettingKey.TENANT_BRAND_ACCENT_COLOR.name()), "#22C55E"));
        }
        if (normalized.containsKey(SettingKey.TENANT_BRAND_LOGO_BASE64.name())) {
            normalized.put(SettingKey.TENANT_BRAND_LOGO_BASE64.name(),
                    TenantGeneralSettingsService.normalizeLogoDataUri(normalized.get(SettingKey.TENANT_BRAND_LOGO_BASE64.name())));
        }
        return normalized;
    }

    private java.util.Optional<String> latestGlobalSettingValue(SettingKey key) {
        return repository.findAllByKey(key).stream()
                .max((a, b) -> {
                    var au = a.getUpdatedAt();
                    var bu = b.getUpdatedAt();
                    if (au == null && bu == null) return 0;
                    if (au == null) return -1;
                    if (bu == null) return 1;
                    return au.compareTo(bu);
                })
                .map(AppSetting::getValue)
                .map(v -> decodeForRead(key.name(), v));
    }

    private void applyPlatformModuleVisibilityRules(Map<String, String> values) {
        String rawRules = values.get(SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON.name());
        Map<String, Map<String, Object>> rules = Map.of();
        if (rawRules != null && !rawRules.isBlank()) {
            try {
                rules = JSON.readValue(rawRules, new TypeReference<>() {});
            } catch (Exception ignored) {
                rules = Map.of();
            }
        }
        String tenantPackage = values.getOrDefault(SettingKey.SIGNUP_PACKAGE_NAME.name(), "BASIC");
        String tenantConfigType = normalizeModuleConfigType(values.get(SettingKey.MODULE_CONFIG_TYPE.name()));
        Map<String, Map<String, Object>> finalRules = rules;
        MODULE_VISIBILITY_SETTING_KEYS.forEach(moduleKey -> {
            Map<String, Object> rule = finalRules.get(moduleKey);
            if (moduleVisibleForTenant(moduleKey, rule, tenantPackage, tenantConfigType)) {
                return;
            }
            values.put(moduleKey, "false");
        });
    }

    private boolean moduleVisibleForTenant(String moduleKey, Map<String, Object> rule, String tenantPackage, String tenantConfigType) {
        String minPackage = defaultModuleVisibilityPackage(moduleKey);
        String configType = "";
        if (rule != null) {
            minPackage = normalizeModuleVisibilityPackage(rule.get("minPackage"));
            configType = normalizeOptionalModuleConfigType(rule.get("configType"));
        }
        if (packageRank(tenantPackage) < packageRank(minPackage)) {
            return false;
        }
        return configType.isBlank() || configType.equals(tenantConfigType);
    }

    private static String defaultModuleVisibilityPackage(String moduleKey) {
        return switch (moduleKey) {
            case "BILLING_ENABLED",
                    "BILLING_INVOICES_ENABLED",
                    "BILLING_ONLINE_CARD_PAYMENTS_ENABLED",
                    "BILLING_BANK_TRANSFER_ENABLED",
                    "BILLING_PAYPAL_ENABLED",
                    "BILLING_GIFT_CARDS_ENABLED",
                    "BILLING_ADVANCE_ENABLED",
                    "SPACES_ENABLED",
                    "MULTIPLE_SESSIONS_PER_SPACE_ENABLED",
                    "GROUP_BOOKING_ENABLED",
                    "MULTIPLE_CLIENTS_PER_SESSION_ENABLED" -> "PROFESSIONAL";
            case "INBOX_ENABLED", "AI_BOOKING_ENABLED" -> "PREMIUM";
            default -> "BASIC";
        };
    }

    private static int packageRank(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "PREMIUM", "CUSTOM" -> 3;
            case "PROFESSIONAL", "PRO", "TRIAL" -> 2;
            default -> 1;
        };
    }

    private static String normalizeModuleVisibilityPackage(Object raw) {
        String normalized = raw == null ? "" : String.valueOf(raw).trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "PREMIUM" -> "PREMIUM";
            case "PROFESSIONAL", "PRO" -> "PROFESSIONAL";
            default -> "BASIC";
        };
    }

    private static String normalizeOptionalModuleConfigType(Object raw) {
        String normalized = raw == null ? "" : String.valueOf(raw).trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if (normalized.equals("all") || normalized.equals("any") || normalized.equals("*") || normalized.equals("none")) {
            return "";
        }
        return switch (normalized) {
            case "salon", "gym", "therapy", "spa", "personal_training" -> normalized;
            default -> "";
        };
    }

    private static String normalizeModuleConfigType(String raw) {
        String normalized = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "salon", "gym", "therapy", "spa", "personal_training" -> normalized;
            default -> "salon";
        };
    }

    private static boolean isSuperAdmin(User user) {
        return user != null && user.getRole() == Role.SUPER_ADMIN;
    }

    private String encodeForSave(SettingKey key, String value) {
        if (isSecretKey(key)) {
            String raw = value == null ? "" : value.trim();
            return raw.isBlank() ? "" : crypto.encrypt(raw);
        }
        return value;
    }

    private String decodeForRead(String keyName, String value) {
        SettingKey key = parseSettingKey(keyName);
        if (key != null && isSecretKey(key)) {
            String decrypted = crypto.decryptIfEncrypted(value);
            return decrypted == null || decrypted.isBlank() ? "" : MASKED_SECRET_VALUE;
        }
        return value;
    }

    private boolean isSecretKey(SettingKey key) {
        return key != null && SECRET_KEYS.contains(key);
    }

    private boolean isMaskedSecretValue(String value) {
        if (value == null) return false;
        String trimmed = value.trim();
        return MASKED_SECRET_VALUE.equals(trimmed)
                || "********".equals(trimmed)
                || "••••••••••••••••".equals(trimmed);
    }

    private SettingKey parseSettingKey(String keyName) {
        if (keyName == null || keyName.isBlank()) return null;
        try {
            return SettingKey.valueOf(keyName);
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private boolean isKnownSettingKey(String keyName) {
        if (keyName == null || keyName.isBlank()) return false;
        return Arrays.stream(SettingKey.values()).anyMatch(k -> k.name().equals(keyName));
    }

    private static String normalizeGuestAppAssetField(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT);
        return switch (value) {
            case "card", "cardimage", "cardimageurl" -> "cardImageUrl";
            case "logo", "logoimage", "logoimageurl" -> "logoImageUrl";
            case "icon", "iconimage", "iconimageurl" -> "iconImageUrl";
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported guest app asset type.");
        };
    }

    public record GuestAppAssetUploadResponse(
            String settingField,
            String objectKey,
            String publicUrl,
            String contentType,
            long sizeBytes
    ) {}
}
