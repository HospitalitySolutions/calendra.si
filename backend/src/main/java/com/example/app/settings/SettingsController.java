package com.example.app.settings;

import com.example.app.company.PlatformTenantAccountLinkService;
import com.example.app.observability.legacy.LegacyEndpointDefinition;
import com.example.app.observability.legacy.TrackLegacyEndpoint;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.files.TenantFileS3Service;
import com.example.app.email.TenantEmailSenderResolver;
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
            SettingKey.BILLING_FISCAL_CASH_REGISTER_ENABLED.name(),
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

    private static final Set<SettingKey> RESERVATION_RULE_SETTING_KEYS = EnumSet.of(
            SettingKey.TENANT_RESERVATION_RULES_JSON
    );

    private static final Set<SettingKey> PLATFORM_ADMIN_MANAGED_BILLING_KEYS = EnumSet.of(
            SettingKey.BILLING_SUBSCRIPTION_PRICE_OVERRIDE_TYPE,
            SettingKey.BILLING_SUBSCRIPTION_PRICE_OVERRIDE_AMOUNT,
            SettingKey.BILLING_SUBSCRIPTION_PRICE_OVERRIDE_DISCOUNT_PERCENT,
            SettingKey.BILLING_SUBSCRIPTION_PRICE_OVERRIDE_INCLUDE_ADDONS
    );

    private final AppSettingRepository repository;
    private final SettingsCryptoService crypto;
    private final TenantFileS3Service fileStorage;
    private final GlobalPaymentProviderService globalPaymentProviders;
    private final GlobalConsumablesFeatureService globalConsumablesFeatureService;
    private final PlatformTenantAccountLinkService platformTenantAccountLinkService;
    private final CourseModuleAccessService courseModuleAccessService;
    private final TenantSmsQuotaService tenantSmsQuotaService;
    private final TenantReservationRulesService tenantReservationRulesService;
    private final PaymentMethodRepository paymentMethodRepository;

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
            TenantReservationRulesService tenantReservationRulesService,
            PaymentMethodRepository paymentMethodRepository
    ) {
        this.repository = repository;
        this.crypto = crypto;
        this.fileStorage = fileStorage;
        this.globalPaymentProviders = globalPaymentProviders;
        this.globalConsumablesFeatureService = globalConsumablesFeatureService;
        this.platformTenantAccountLinkService = platformTenantAccountLinkService;
        this.courseModuleAccessService = courseModuleAccessService;
        this.tenantSmsQuotaService = tenantSmsQuotaService;
        this.tenantReservationRulesService = tenantReservationRulesService;
        this.paymentMethodRepository = paymentMethodRepository;
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
        this(repository, crypto, fileStorage, globalPaymentProviders, globalConsumablesFeatureService, platformTenantAccountLinkService, null, null, null, null);
    }

    public record PaymentProviderCapabilitiesResponse(boolean stripeEnabled, boolean paypalEnabled) {}
    public record ModuleCapabilitiesResponse(boolean consumablesEnabled) {}
    public record SmsQuotaResponse(int quota, int used, int remaining, boolean warning, boolean exhausted) {}

    @GetMapping("/reservation-rules")
    @TrackLegacyEndpoint(LegacyEndpointDefinition.SETTINGS_RESERVATION_RULES_READ)
    public TenantReservationRulesService.TenantReservationRules reservationRules(@AuthenticationPrincipal User me) {
        if (me == null || me.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        return resolveReservationRules(me.getCompany().getId());
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping("/reservation-rules")
    @TrackLegacyEndpoint(LegacyEndpointDefinition.SETTINGS_RESERVATION_RULES_WRITE)
    @Transactional
    public TenantReservationRulesService.TenantReservationRules saveReservationRules(
            @RequestBody Map<String, String> payload,
            @AuthenticationPrincipal User me
    ) {
        if (me == null || me.getCompany() == null) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authentication required.");
        }
        Long companyId = me.getCompany().getId();
        Map<String, String> normalized = normalizeTenantReservationRulesPayload(payload);
        persistSetting(me, companyId, SettingKey.TENANT_RESERVATION_RULES_JSON,
                normalized.get(SettingKey.TENANT_RESERVATION_RULES_JSON.name()));
        synchronizeReservationRuleSettings(me, companyId, normalized);
        return resolveReservationRules(companyId);
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
        applyTenantReservationRulesDefaults(values);
        if (!isSuperAdmin(me)) {
            applyPlatformModuleVisibilityRules(values);
        }
        applyModuleSettingDependencies(values);
        return values;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    @Transactional
    public Map<String, String> save(@RequestBody Map<String, String> payload, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Map<String, String> normalizedPayload = normalizeModuleDependencyPayload(
                companyId,
                normalizeEmailSenderPayload(companyId, normalizeTenantReservationRulesPayload(payload))
        );
        if ("false".equalsIgnoreCase(String.valueOf(payload.get(SettingKey.COURSES_ENABLED.name())).trim()) && courseModuleAccessService != null) {
            courseModuleAccessService.assertCanDisable(companyId);
        }
        Arrays.stream(SettingKey.values()).forEach(key -> {
            if (normalizedPayload.containsKey(key.name())) {
                if (key == SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON && !isSuperAdmin(me)) {
                    return;
                }
                if (key == SettingKey.EMAIL_CUSTOM_DOMAIN_VERIFICATION_STATUS && !isSuperAdmin(me)) {
                    return;
                }
                if (PLATFORM_ADMIN_MANAGED_BILLING_KEYS.contains(key) && !isSuperAdmin(me)) {
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
        disablePaymentMethodFiscalizationIfNeeded(companyId, normalizedPayload);
        synchronizeReservationRuleSettings(me, companyId, normalizedPayload);
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

    private TenantReservationRulesService.TenantReservationRules resolveReservationRules(Long companyId) {
        if (tenantReservationRulesService != null) {
            return tenantReservationRulesService.resolve(companyId);
        }
        Map<String, String> values = companyId == null
                ? Map.of()
                : repository.findAllByCompanyId(companyId).stream().collect(java.util.stream.Collectors.toMap(
                AppSetting::getKey,
                AppSetting::getValue,
                (a, b) -> b,
                LinkedHashMap::new
        ));
        return TenantReservationRulesService.resolve(values);
    }

    private void applyTenantReservationRulesDefaults(Map<String, String> values) {
        values.putIfAbsent(
                SettingKey.TENANT_RESERVATION_RULES_JSON.name(),
                TenantReservationRulesService.toJson(TenantReservationRulesService.resolve(values))
        );
    }

    private Map<String, String> normalizeTenantReservationRulesPayload(Map<String, String> payload) {
        Map<String, String> normalized = new LinkedHashMap<>(payload == null ? Map.of() : payload);
        if (normalized.containsKey(SettingKey.TENANT_RESERVATION_RULES_JSON.name())) {
            String json = TenantReservationRulesService.normalizeJson(
                    normalized.get(SettingKey.TENANT_RESERVATION_RULES_JSON.name()));
            normalized.put(SettingKey.TENANT_RESERVATION_RULES_JSON.name(), json);
        }
        return normalized;
    }

    private Map<String, String> normalizeModuleDependencyPayload(Long companyId, Map<String, String> payload) {
        Map<String, String> normalized = new LinkedHashMap<>(payload == null ? Map.of() : payload);
        String multipleClientsKey = SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED.name();
        String groupBookingKey = SettingKey.GROUP_BOOKING_ENABLED.name();
        if (!normalized.containsKey(multipleClientsKey) && !normalized.containsKey(groupBookingKey)) {
            return normalized;
        }
        boolean multipleClientsEnabled = "true".equalsIgnoreCase(
                String.valueOf(payloadOrStored(companyId, normalized, SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED)).trim()
        );
        if (!multipleClientsEnabled) {
            normalized.put(groupBookingKey, "false");
        }
        return normalized;
    }

    private void applyModuleSettingDependencies(Map<String, String> values) {
        if (values == null) return;
        boolean multipleClientsEnabled = "true".equalsIgnoreCase(
                String.valueOf(values.getOrDefault(SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED.name(), "false")).trim()
        );
        if (!multipleClientsEnabled) {
            values.put(SettingKey.GROUP_BOOKING_ENABLED.name(), "false");
        }
    }

    private Map<String, String> normalizeEmailSenderPayload(Long companyId, Map<String, String> payload) {
        Map<String, String> normalized = new LinkedHashMap<>(payload == null ? Map.of() : payload);
        normalizeEmailValue(normalized, SettingKey.EMAIL_CUSTOM_FROM_EMAIL);
        normalizeEmailValue(normalized, SettingKey.EMAIL_CUSTOM_REPLY_TO_EMAIL);
        if (normalized.containsKey(SettingKey.EMAIL_CUSTOM_DOMAIN.name())) {
            normalized.put(SettingKey.EMAIL_CUSTOM_DOMAIN.name(),
                    TenantEmailSenderResolver.normalizeDomain(normalized.get(SettingKey.EMAIL_CUSTOM_DOMAIN.name())));
        }
        if (normalized.containsKey(SettingKey.EMAIL_CUSTOM_FROM_NAME.name())) {
            normalized.put(SettingKey.EMAIL_CUSTOM_FROM_NAME.name(),
                    singleLine(normalized.get(SettingKey.EMAIL_CUSTOM_FROM_NAME.name()), 100));
        }
        String modeKey = SettingKey.EMAIL_SENDER_MODE.name();
        if (normalized.containsKey(modeKey)) {
            String mode = String.valueOf(normalized.get(modeKey)).trim().toUpperCase(Locale.ROOT);
            normalized.put(modeKey, "CUSTOM_DOMAIN".equals(mode) ? "CUSTOM_DOMAIN" : "DEFAULT_CALENDRA");
            if ("CUSTOM_DOMAIN".equals(normalized.get(modeKey)) && !emailCustomDomainReady(companyId, normalized)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Custom email sender cannot be enabled until the domain is verified and the from address matches it.");
            }
        }
        return normalized;
    }

    private void normalizeEmailValue(Map<String, String> payload, SettingKey key) {
        if (!payload.containsKey(key.name())) return;
        payload.put(key.name(), singleLine(payload.get(key.name()), 320).toLowerCase(Locale.ROOT));
    }

    private String singleLine(String value, int maxLength) {
        String normalized = value == null ? "" : value.replace("\r", " ").replace("\n", " ").trim();
        return normalized.length() <= maxLength ? normalized : normalized.substring(0, maxLength);
    }

    private boolean emailCustomDomainReady(Long companyId, Map<String, String> payload) {
        String fromEmail = payloadOrStored(companyId, payload, SettingKey.EMAIL_CUSTOM_FROM_EMAIL);
        String domain = payloadOrStored(companyId, payload, SettingKey.EMAIL_CUSTOM_DOMAIN);
        String status = payloadOrStored(companyId, payload, SettingKey.EMAIL_CUSTOM_DOMAIN_VERIFICATION_STATUS);
        if (domain == null || domain.isBlank()) {
            domain = TenantEmailSenderResolver.domainOf(fromEmail);
        }
        String normalizedStatus = status == null ? "" : status.trim().toUpperCase(Locale.ROOT);
        return ("VERIFIED".equals(normalizedStatus) || "SUCCESS".equals(normalizedStatus))
                && TenantEmailSenderResolver.isValidEmail(fromEmail)
                && TenantEmailSenderResolver.emailBelongsToDomain(fromEmail, domain);
    }

    private String payloadOrStored(Long companyId, Map<String, String> payload, SettingKey key) {
        if (payload != null && payload.containsKey(key.name())) return payload.get(key.name());
        return repository.findByCompanyIdAndKey(companyId, key).map(AppSetting::getValue).orElse("");
    }

    private void synchronizeReservationRuleSettings(User me, Long companyId, Map<String, String> payload) {
        if (payload == null || !payload.containsKey(SettingKey.TENANT_RESERVATION_RULES_JSON.name())) return;
        String rawRules = payload.getOrDefault(SettingKey.TENANT_RESERVATION_RULES_JSON.name(), "");
        TenantReservationRulesService.TenantReservationRules rules = TenantReservationRulesService.resolve(
                Map.of(SettingKey.TENANT_RESERVATION_RULES_JSON.name(), rawRules == null ? "" : rawRules));
        String existingGuestRules = existingOrPayload(companyId, payload, SettingKey.GUEST_BOOKING_RULES_JSON);
        String existingWebsiteRules = existingOrPayload(companyId, payload, SettingKey.WEBSITE_BOOKING_RULES_JSON);
        String existingGuestApp = existingOrPayload(companyId, payload, SettingKey.GUEST_APP_SETTINGS_JSON);
        String existingWebsite = existingOrPayload(companyId, payload, SettingKey.WEBSITE_WIDGET_SETTINGS_JSON);
        persistSetting(me, companyId, SettingKey.GUEST_BOOKING_RULES_JSON,
                TenantReservationRulesService.mergeIntoGuestBookingRulesJson(existingGuestRules, rules));
        persistSetting(me, companyId, SettingKey.WEBSITE_BOOKING_RULES_JSON,
                TenantReservationRulesService.mergeIntoWebsiteBookingRulesJson(existingWebsiteRules, rules));
        persistSetting(me, companyId, SettingKey.GUEST_APP_SETTINGS_JSON,
                TenantReservationRulesService.mergeIntoGuestAppSettingsJson(existingGuestApp, rules));
        persistSetting(me, companyId, SettingKey.WEBSITE_WIDGET_SETTINGS_JSON,
                TenantReservationRulesService.mergeIntoWebsiteWidgetSettingsJson(existingWebsite, rules));
    }

    private String existingOrPayload(Long companyId, Map<String, String> payload, SettingKey key) {
        if (payload != null && payload.containsKey(key.name())) return payload.get(key.name());
        return repository.findByCompanyIdAndKey(companyId, key).map(AppSetting::getValue).orElse("");
    }

    private void persistSetting(User me, Long companyId, SettingKey key, String value) {
        var setting = repository.findByCompanyIdAndKey(companyId, key).orElseGet(() -> {
            var ns = new AppSetting();
            ns.setCompany(me.getCompany());
            ns.setKey(key.name());
            return ns;
        });
        setting.setKey(key.name());
        setting.setValue(value == null ? "" : value);
        repository.save(setting);
    }


    private void disablePaymentMethodFiscalizationIfNeeded(Long companyId, Map<String, String> payload) {
        if (paymentMethodRepository == null || companyId == null || payload == null) return;
        String raw = payload.get(SettingKey.BILLING_FISCAL_CASH_REGISTER_ENABLED.name());
        if (!"false".equalsIgnoreCase(String.valueOf(raw).trim())) return;
        var methods = paymentMethodRepository.findAllByCompanyIdOrderByNameAsc(companyId);
        boolean dirty = false;
        for (var method : methods) {
            if (method.isFiscalized()) {
                method.setFiscalized(false);
                dirty = true;
            }
        }
        if (dirty) {
            paymentMethodRepository.saveAll(methods);
        }
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
                    "BILLING_FISCAL_CASH_REGISTER_ENABLED",
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
