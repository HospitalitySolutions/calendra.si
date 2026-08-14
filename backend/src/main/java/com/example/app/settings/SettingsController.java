package com.example.app.settings;

import com.example.app.activitylog.ActivityAction;
import com.example.app.activitylog.ActivityDetails;
import com.example.app.activitylog.ActivityLogService;
import com.example.app.activitylog.ActivityModule;
import com.example.app.company.Company;
import com.example.app.company.PlatformTenantAccountLinkService;
import com.example.app.session.SessionTypeBreakSettingsService;
import com.example.app.observability.legacy.LegacyEndpointDefinition;
import com.example.app.observability.legacy.TrackLegacyEndpoint;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billingissuer.CompanyLegalEntity;
import com.example.app.billingissuer.CompanyLegalEntityRepository;
import com.example.app.billingissuer.InvoiceSeries;
import com.example.app.billingissuer.InvoiceSeriesRepository;
import com.example.app.files.TenantFileS3Service;
import com.example.app.email.TenantEmailSenderResolver;
import com.example.app.workspacesubscription.WorkspaceSubscriptionService;
import java.util.Locale;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
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
    private static final Set<String> LEGACY_GUEST_PUBLIC_IDENTITY_FIELDS = Set.of(
            "publicDiscoverable", "publicName", "publicAddress",
            "publicDescription", "publicPhone", "logoImageUrl"
    );
    private static final Set<String> MODULE_VISIBILITY_SETTING_KEYS = Set.of(
            SettingKey.LOCATIONS_ENABLED.name(),
            SettingKey.SPACES_ENABLED.name(),
            SettingKey.TYPES_ENABLED.name(),
            SettingKey.ENTITLEMENTS_ENABLED.name(),
            SettingKey.COURSES_ENABLED.name(),
            SettingKey.CONSUMABLES_ENABLED.name(),
            SettingKey.BOOKABLE_ENABLED.name(),
            SettingKey.NO_SHOW_ENABLED.name(),
            SettingKey.ONLINE_SESSION_BOOKING_ENABLED.name(),
            SettingKey.WEBSITE_WIDGET_ENABLED.name(),
            SettingKey.WAITLIST_ENABLED.name(),
            SettingKey.CUSTOM_FIELDS_ENABLED.name(),
            SettingKey.AI_BOOKING_ENABLED.name(),
            SettingKey.PERSONAL_ENABLED.name(),
            SettingKey.TODOS_ENABLED.name(),
            SettingKey.MULTIPLE_SESSIONS_PER_SPACE_ENABLED.name(),
            SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED.name(),
            SettingKey.GROUP_BOOKING_ENABLED.name(),
            SettingKey.BILLING_ENABLED.name(),
            SettingKey.MULTIPLE_COMPANIES_ENABLED.name(),
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
            SettingKey.CUSTOM_EMAIL_SENDER_ENABLED.name(),
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
    private final TenantFeatureAccessService tenantFeatureAccessService;
    private final PlatformTenantAccountLinkService platformTenantAccountLinkService;
    private final CourseModuleAccessService courseModuleAccessService;
    private final TenantSmsQuotaService tenantSmsQuotaService;
    private final TenantReservationRulesService tenantReservationRulesService;
    private final PaymentMethodRepository paymentMethodRepository;
    private final SessionTypeBreakSettingsService sessionTypeBreakSettingsService;
    private CompanyLegalEntityRepository billingIssuerAssignments;
    private InvoiceSeriesRepository invoiceSeriesRepository;
    private WorkspaceSubscriptionService workspaceSubscriptions;

    @Autowired(required = false)
    private ActivityLogService activityLogs;

    @Autowired
    public SettingsController(
            AppSettingRepository repository,
            SettingsCryptoService crypto,
            TenantFileS3Service fileStorage,
            GlobalPaymentProviderService globalPaymentProviders,
            GlobalConsumablesFeatureService globalConsumablesFeatureService,
            TenantFeatureAccessService tenantFeatureAccessService,
            PlatformTenantAccountLinkService platformTenantAccountLinkService,
            CourseModuleAccessService courseModuleAccessService,
            TenantSmsQuotaService tenantSmsQuotaService,
            TenantReservationRulesService tenantReservationRulesService,
            PaymentMethodRepository paymentMethodRepository,
            SessionTypeBreakSettingsService sessionTypeBreakSettingsService
    ) {
        this.repository = repository;
        this.crypto = crypto;
        this.fileStorage = fileStorage;
        this.globalPaymentProviders = globalPaymentProviders;
        this.globalConsumablesFeatureService = globalConsumablesFeatureService;
        this.tenantFeatureAccessService = tenantFeatureAccessService;
        this.platformTenantAccountLinkService = platformTenantAccountLinkService;
        this.courseModuleAccessService = courseModuleAccessService;
        this.tenantSmsQuotaService = tenantSmsQuotaService;
        this.tenantReservationRulesService = tenantReservationRulesService;
        this.paymentMethodRepository = paymentMethodRepository;
        this.sessionTypeBreakSettingsService = sessionTypeBreakSettingsService;
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
        this(
                repository,
                crypto,
                fileStorage,
                globalPaymentProviders,
                globalConsumablesFeatureService,
                new TenantFeatureAccessService(repository),
                platformTenantAccountLinkService,
                null,
                null,
                null,
                null,
                null
        );
    }

    @Autowired(required = false)
    void configureWorkspaceSubscriptions(WorkspaceSubscriptionService workspaceSubscriptions) {
        this.workspaceSubscriptions = workspaceSubscriptions;
    }

    @Autowired(required = false)
    void configureBillingIssuerCompatibility(
            CompanyLegalEntityRepository billingIssuerAssignments,
            InvoiceSeriesRepository invoiceSeriesRepository
    ) {
        this.billingIssuerAssignments = billingIssuerAssignments;
        this.invoiceSeriesRepository = invoiceSeriesRepository;
    }

    public record PaymentProviderCapabilitiesResponse(boolean stripeEnabled, boolean paypalEnabled) {}
    public record ModuleCapabilitiesResponse(boolean waitlistEnabled, boolean consumablesEnabled) {}
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
        TenantReservationRulesService.TenantReservationRules result = resolveReservationRules(companyId);
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.RESERVATION_RULES_UPDATED,
                    "RESERVATION_RULES", companyId, "Reservation rules", "Updated reservation rules", null, null,
                    ActivityDetails.of("targetPath", "/configuration?tab=booking"));
        }
        return result;
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
        overlayWorkspaceSubscriptionProjection(me, companyId, values);

        latestGlobalSettingValue(SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON)
                .ifPresent(v -> values.put(SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON.name(), v));
        applyTenantReservationRulesDefaults(values);
        applyLocationModuleDefault(values);
        if (!isSuperAdmin(me)) {
            applyPlatformModuleVisibilityRules(values);
            if (!locationFeatureEntitled(me, companyId)) {
                values.put(SettingKey.LOCATIONS_ENABLED.name(), "false");
            }
        }
        applyModuleSettingDependencies(values);
        values.putIfAbsent(SettingKey.DEFAULT_SERVICE_BREAK_MINUTES.name(), "0");
        values.putIfAbsent(SettingKey.CALENDAR_TIME_SCALE_MINUTES.name(), "30");
        values.putIfAbsent(SettingKey.DEFAULT_INVOICE_PRINT_FORMAT.name(), "A4");
        values.putIfAbsent(SettingKey.POS_PRINTING_MODE.name(), "STANDARD");
        values.putIfAbsent(SettingKey.POS_PRINTER_PAPER_WIDTH_MM.name(), "58");
        values.putIfAbsent(SettingKey.POS_PRINTER_TEMPLATE.name(), "COMPACT");
        values.putIfAbsent(SettingKey.POS_PRINTER_PRINT_LOGO.name(), "true");
        values.putIfAbsent(SettingKey.POS_PRINTER_PRINT_QR.name(), "true");
        values.putIfAbsent(SettingKey.POS_PRINTER_AUTO_CUT.name(), "false");
        return values;
    }

    @PreAuthorize("hasRole('ADMIN')")
    @PutMapping
    @Transactional
    public Map<String, String> save(@RequestBody Map<String, String> payload, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        Map<String, String> normalizedPayload = normalizeInvoicePrintFormatPayload(
                normalizeCalendarTimeScalePayload(
                        normalizeModuleDependencyPayload(
                                companyId,
                                normalizeEmailSenderPayload(companyId, normalizeTenantReservationRulesPayload(payload))
                        )
                )
        );
        if (normalizedPayload.containsKey(SettingKey.LOCATIONS_ENABLED.name())
                && !locationFeatureEntitled(me, companyId)) {
            normalizedPayload.put(SettingKey.LOCATIONS_ENABLED.name(), "false");
        }
        if (!isSuperAdmin(me)) {
            enforceTenantModuleVisibilityOnSave(companyId, normalizedPayload);
        }
        boolean workspaceProjectionRequested = workspaceSubscriptions != null && "true".equalsIgnoreCase(
                String.valueOf(payload.get("__workspaceSubscriptionProjection")));
        if (workspaceProjectionRequested) {
            workspaceSubscriptions.requireWorkspaceAdministrator(me, me.getCompany().getWorkspace().getId());
        }
        Company workspaceBillingOwner = workspaceProjectionRequested ? workspaceSubscriptions.billingOwnerCompany(me) : null;
        boolean projectToDifferentCompany = workspaceBillingOwner != null
                && workspaceBillingOwner.getId() != null
                && !workspaceBillingOwner.getId().equals(companyId);
        boolean entitlementsDisabledForSave = "false".equalsIgnoreCase(
                String.valueOf(payloadOrStored(companyId, normalizedPayload, SettingKey.ENTITLEMENTS_ENABLED)).trim());
        if ("false".equalsIgnoreCase(String.valueOf(normalizedPayload.get(SettingKey.COURSES_ENABLED.name())).trim())
                && !entitlementsDisabledForSave
                && courseModuleAccessService != null) {
            courseModuleAccessService.assertCanDisable(companyId);
        }
        Arrays.stream(SettingKey.values()).forEach(key -> {
            if (normalizedPayload.containsKey(key.name())) {
                if (workspaceProjectionRequested && projectToDifferentCompany
                        && isWorkspaceSubscriptionProjectionKey(key.name())) {
                    return;
                }
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
        synchronizeLegacyBillingIdentitySettings(companyId, normalizedPayload);
        if (sessionTypeBreakSettingsService != null
                && normalizedPayload.containsKey(SettingKey.DEFAULT_SERVICE_BREAK_MINUTES.name())) {
            int normalizedDefault = sessionTypeBreakSettingsService.applyDefaultToInheritedServices(
                    companyId, normalizedPayload.get(SettingKey.DEFAULT_SERVICE_BREAK_MINUTES.name()));
            persistSetting(me, companyId, SettingKey.DEFAULT_SERVICE_BREAK_MINUTES, String.valueOf(normalizedDefault));
        }
        disablePaymentMethodFiscalizationIfNeeded(companyId, normalizedPayload);
        synchronizeReservationRuleSettings(me, companyId, normalizedPayload);
        platformTenantAccountLinkService.syncFromTenantSettings(
                projectToDifferentCompany ? workspaceBillingOwner : me.getCompany(), normalizedPayload);
        if (workspaceSubscriptions != null && normalizedPayload.keySet().stream().anyMatch(this::isWorkspaceSubscriptionProjectionKey)) {
            if (workspaceProjectionRequested) {
                mirrorWorkspaceSubscriptionCapacity(workspaceBillingOwner, normalizedPayload);
            } else {
                workspaceSubscriptions.syncFromLegacyCompany(companyId);
            }
        }
        if (activityLogs != null) {
            List<String> changedKeys = normalizedPayload.keySet().stream()
                    .filter(this::isKnownSettingKey)
                    .sorted()
                    .toList();
            List<String> notificationTemplateKeys = changedKeys.stream()
                    .filter(key -> key.startsWith("NOTIFICATIONS_") && (key.contains("_TEMPLATE_TITLE") || key.contains("_TEMPLATE_BODY")))
                    .toList();
            if (!notificationTemplateKeys.isEmpty()) {
                activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.NOTIFICATION_TEMPLATE_UPDATED,
                        "NOTIFICATION_TEMPLATES", companyId, "Notification templates", "Updated notification template", null, null,
                        ActivityDetails.of("changedKeys", notificationTemplateKeys, "targetPath", "/configuration?tab=notifications"));
            }
            List<String> otherKeys = changedKeys.stream().filter(key -> !notificationTemplateKeys.contains(key)).toList();
            if (!otherKeys.isEmpty()) {
                activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.SETTINGS_UPDATED,
                        "SETTINGS", companyId, "Application settings", "Updated application settings", null, null,
                        ActivityDetails.of("changedKeys", otherKeys, "targetPath", "/configuration"));
            }
        }
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
        if (activityLogs != null) {
            activityLogs.recordUser(me, ActivityModule.CONFIGURATION, ActivityAction.SETTINGS_UPDATED,
                    "GUEST_APP_ASSET", null, settingField, "Updated Guest App asset", null, null,
                    ActivityDetails.of("assetType", settingField, "targetPath", "/configuration"));
        }
        return new GuestAppAssetUploadResponse(settingField, stored.objectKey(), publicUrl, stored.contentType(), stored.sizeBytes());
    }

    @GetMapping("/payment-capabilities")
    public PaymentProviderCapabilitiesResponse paymentCapabilities(@AuthenticationPrincipal User me) {
        var caps = globalPaymentProviders.capabilities();
        return new PaymentProviderCapabilitiesResponse(caps.stripeEnabled(), caps.paypalEnabled());
    }

    @GetMapping("/module-capabilities")
    public ModuleCapabilitiesResponse moduleCapabilities(@AuthenticationPrincipal User me) {
        Long companyId = me == null || me.getCompany() == null ? null : me.getCompany().getId();
        return new ModuleCapabilitiesResponse(
                tenantFeatureAccessService.isWaitlistEnabled(companyId),
                globalConsumablesFeatureService.isEnabledForCompany(companyId)
        );
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

    private Map<String, String> normalizeInvoicePrintFormatPayload(Map<String, String> payload) {
        Map<String, String> normalized = new LinkedHashMap<>(payload == null ? Map.of() : payload);
        String key = SettingKey.DEFAULT_INVOICE_PRINT_FORMAT.name();
        if (normalized.containsKey(key)) {
            String raw = String.valueOf(normalized.get(key)).trim().toUpperCase(Locale.ROOT)
                    .replace('-', '_').replace(' ', '_');
            String value = switch (raw) {
                case "POS58", "POS_58MM", "58MM" -> "POS_58";
                case "POS_58", "ASK" -> raw;
                default -> "A4";
            };
            normalized.put(key, value);
        }
        return normalized;
    }

    private Map<String, String> normalizeCalendarTimeScalePayload(Map<String, String> payload) {
        Map<String, String> normalized = new LinkedHashMap<>(payload == null ? Map.of() : payload);
        String key = SettingKey.CALENDAR_TIME_SCALE_MINUTES.name();
        if (normalized.containsKey(key)) {
            normalized.put(key, "60".equals(String.valueOf(normalized.get(key)).trim()) ? "60" : "30");
        }
        return normalized;
    }

    private Map<String, String> normalizeModuleDependencyPayload(Long companyId, Map<String, String> payload) {
        Map<String, String> normalized = new LinkedHashMap<>(payload == null ? Map.of() : payload);
        String multipleClientsKey = SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED.name();
        String groupBookingKey = SettingKey.GROUP_BOOKING_ENABLED.name();
        if (normalized.containsKey(multipleClientsKey) || normalized.containsKey(groupBookingKey)) {
            boolean multipleClientsEnabled = "true".equalsIgnoreCase(
                    String.valueOf(payloadOrStored(companyId, normalized, SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED)).trim()
            );
            if (!multipleClientsEnabled) {
                normalized.put(groupBookingKey, "false");
            }
        }

        String entitlementsKey = SettingKey.ENTITLEMENTS_ENABLED.name();
        String coursesKey = SettingKey.COURSES_ENABLED.name();
        if (normalized.containsKey(entitlementsKey) || normalized.containsKey(coursesKey)) {
            boolean entitlementsEnabled = !"false".equalsIgnoreCase(
                    String.valueOf(payloadOrStored(companyId, normalized, SettingKey.ENTITLEMENTS_ENABLED)).trim()
            );
            if (!entitlementsEnabled) {
                normalized.put(coursesKey, "false");
            }
        }

        String typesKey = SettingKey.TYPES_ENABLED.name();
        String consumablesKey = SettingKey.CONSUMABLES_ENABLED.name();
        if (normalized.containsKey(typesKey) || normalized.containsKey(consumablesKey)) {
            boolean typesEnabled = "true".equalsIgnoreCase(
                    String.valueOf(payloadOrStored(companyId, normalized, SettingKey.TYPES_ENABLED)).trim()
            );
            if (!typesEnabled) {
                normalized.put(consumablesKey, "false");
            }
        }

        String billingKey = SettingKey.BILLING_ENABLED.name();
        String multipleCompaniesKey = SettingKey.MULTIPLE_COMPANIES_ENABLED.name();
        if (normalized.containsKey(billingKey) || normalized.containsKey(multipleCompaniesKey)) {
            boolean billingEnabled = "true".equalsIgnoreCase(
                    String.valueOf(payloadOrStored(companyId, normalized, SettingKey.BILLING_ENABLED)).trim()
            );
            if (!billingEnabled) {
                normalized.put(multipleCompaniesKey, "false");
            }
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
        boolean entitlementsEnabled = !"false".equalsIgnoreCase(
                String.valueOf(values.getOrDefault(SettingKey.ENTITLEMENTS_ENABLED.name(), "true")).trim()
        );
        if (!entitlementsEnabled) {
            values.put(SettingKey.COURSES_ENABLED.name(), "false");
        }
        boolean typesEnabled = "true".equalsIgnoreCase(
                String.valueOf(values.getOrDefault(SettingKey.TYPES_ENABLED.name(), "false")).trim()
        );
        if (!typesEnabled) {
            values.put(SettingKey.CONSUMABLES_ENABLED.name(), "false");
        }
        boolean billingEnabled = "true".equalsIgnoreCase(
                String.valueOf(values.getOrDefault(SettingKey.BILLING_ENABLED.name(), "false")).trim()
        );
        if (!billingEnabled) {
            values.put(SettingKey.MULTIPLE_COMPANIES_ENABLED.name(), "false");
        }
    }

    private boolean locationFeatureEntitled(User me, Long companyId) {
        if (isSuperAdmin(me)) return true;
        String packageName = repository.findByCompanyIdAndKey(companyId, SettingKey.SIGNUP_PACKAGE_NAME)
                .map(AppSetting::getValue)
                .map(value -> value == null ? "" : value.trim().toUpperCase(Locale.ROOT)
                        .replace('-', '_').replace(' ', '_'))
                .orElse("BASIC");
        if ("PREMIUM".equals(packageName) || "BUSINESS".equals(packageName)) return true;
        if (!"CUSTOM".equals(packageName)) return false;
        return repository.findByCompanyIdAndKey(companyId, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS)
                .map(AppSetting::getValue)
                .map(value -> value == null ? "" : value)
                .stream()
                .flatMap(value -> Arrays.stream(value.split("[,;\\s]+")))
                .map(value -> value.trim().toUpperCase(Locale.ROOT))
                .anyMatch(SettingKey.LOCATIONS_ENABLED.name()::equals);
    }

    private void applyLocationModuleDefault(Map<String, String> values) {
        if (values == null || values.containsKey(SettingKey.LOCATIONS_ENABLED.name())) return;
        String normalizedPackage = String.valueOf(
                        values.getOrDefault(SettingKey.SIGNUP_PACKAGE_NAME.name(), "BASIC"))
                .trim()
                .toUpperCase(Locale.ROOT)
                .replace('-', '_')
                .replace(' ', '_');
        // Existing Premium tenants keep the location feature enabled when the new
        // setting has not been persisted yet. Custom tenants are opt-in through the
        // Platform Admin feature selection and therefore default to OFF.
        values.put(
                SettingKey.LOCATIONS_ENABLED.name(),
                Boolean.toString("PREMIUM".equals(normalizedPackage) || "BUSINESS".equals(normalizedPackage))
        );
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

    private void overlayWorkspaceSubscriptionProjection(User me, Long activeCompanyId, Map<String, String> values) {
        if (workspaceSubscriptions == null || me == null || activeCompanyId == null || values == null) return;
        Company owner = workspaceSubscriptions.billingOwnerCompany(me);
        if (owner == null || owner.getId() == null || owner.getId().equals(activeCompanyId)) return;
        repository.findAllByCompanyId(owner.getId()).stream()
                .filter(setting -> isWorkspaceSubscriptionProjectionKey(setting.getKey()))
                .forEach(setting -> values.put(setting.getKey(), decodeForRead(setting.getKey(), setting.getValue())));
    }

    private boolean isWorkspaceSubscriptionProjectionKey(String key) {
        if (key == null || key.isBlank()) return false;
        return key.startsWith("BILLING_SUBSCRIPTION_")
                || key.equals(SettingKey.SIGNUP_PACKAGE_NAME.name())
                || key.equals(SettingKey.SIGNUP_USER_COUNT.name())
                || key.equals(SettingKey.SIGNUP_SMS_COUNT.name())
                || key.equals(SettingKey.SIGNUP_ADDON_KEYS.name());
    }

    private void mirrorWorkspaceSubscriptionCapacity(Company owner, Map<String, String> payload) {
        if (owner == null || owner.getId() == null) return;
        Set<SettingKey> projectionKeys = EnumSet.of(
                SettingKey.SIGNUP_USER_COUNT,
                SettingKey.SIGNUP_SMS_COUNT,
                SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT,
                SettingKey.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT,
                SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS,
                SettingKey.BILLING_SUBSCRIPTION_NEXT_USER_COUNT,
                SettingKey.BILLING_SUBSCRIPTION_NEXT_SMS_COUNT,
                SettingKey.BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS
        );
        for (SettingKey key : projectionKeys) {
            if (!payload.containsKey(key.name())) continue;
            AppSetting setting = repository.findByCompanyIdAndKey(owner.getId(), key).orElseGet(() -> {
                AppSetting created = new AppSetting();
                created.setCompany(owner);
                created.setKey(key.name());
                return created;
            });
            setting.setValue(encodeForSave(key, payload.get(key.name())));
            repository.save(setting);
        }
        workspaceSubscriptions.syncFromLegacyCompany(owner.getId());
    }

    private void persistSetting(User me, Long companyId, SettingKey key, String value) {
        var setting = repository.findByCompanyIdAndKey(companyId, key).orElseGet(() -> {
            var ns = new AppSetting();
            ns.setCompany(me.getCompany());
            ns.setKey(key.name());
            return ns;
        });
        setting.setKey(key.name());
        setting.setValue(encodeForSave(key, value == null ? "" : value));
        repository.save(setting);
    }


    private void synchronizeLegacyBillingIdentitySettings(Long companyId, Map<String, String> payload) {
        if (companyId == null || payload == null || payload.isEmpty()
                || billingIssuerAssignments == null || invoiceSeriesRepository == null) {
            return;
        }
        Set<String> relevant = Set.of(
                SettingKey.COMPANY_NAME.name(), SettingKey.COMPANY_ADDRESS.name(),
                SettingKey.COMPANY_POSTAL_CODE.name(), SettingKey.COMPANY_CITY.name(),
                SettingKey.COMPANY_VAT_ID.name(), SettingKey.COMPANY_IBAN.name(),
                SettingKey.COMPANY_BIC.name(), SettingKey.COMPANY_EMAIL.name(),
                SettingKey.COMPANY_TELEPHONE.name(), SettingKey.FISCAL_ENVIRONMENT.name(),
                SettingKey.FISCAL_TAX_NUMBER.name(), SettingKey.FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER.name(),
                SettingKey.FISCAL_CERTIFICATE_PASSWORD.name(), SettingKey.FISCAL_BUSINESS_PREMISE_ID.name(),
                SettingKey.FISCAL_DEVICE_ID.name(), SettingKey.INVOICE_COUNTER.name()
        );
        if (payload.keySet().stream().noneMatch(relevant::contains)) return;

        CompanyLegalEntity assignment = billingIssuerAssignments
                .findFirstByCompanyIdAndActiveTrueOrderByDefaultIssuerDescIdAsc(companyId)
                .orElse(null);
        if (assignment == null || assignment.getLegalEntity() == null) return;

        var issuer = assignment.getLegalEntity();
        boolean issuerExclusiveToUnit = billingIssuerAssignments.countByLegalEntityIdAndActiveTrue(issuer.getId()) == 1;
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.COMPANY_NAME.name())) issuer.setName(nonBlankOrCurrent(payload.get(SettingKey.COMPANY_NAME.name()), issuer.getName()));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.COMPANY_ADDRESS.name())) issuer.setAddress(trimToNull(payload.get(SettingKey.COMPANY_ADDRESS.name())));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.COMPANY_POSTAL_CODE.name())) issuer.setPostalCode(trimToNull(payload.get(SettingKey.COMPANY_POSTAL_CODE.name())));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.COMPANY_CITY.name())) issuer.setCity(trimToNull(payload.get(SettingKey.COMPANY_CITY.name())));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.COMPANY_VAT_ID.name())) issuer.setVatId(trimToNull(payload.get(SettingKey.COMPANY_VAT_ID.name())));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.COMPANY_IBAN.name())) issuer.setIban(trimToNull(payload.get(SettingKey.COMPANY_IBAN.name())));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.COMPANY_BIC.name())) issuer.setBic(trimToNull(payload.get(SettingKey.COMPANY_BIC.name())));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.COMPANY_EMAIL.name())) issuer.setEmail(trimToNull(payload.get(SettingKey.COMPANY_EMAIL.name())));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.COMPANY_TELEPHONE.name())) issuer.setTelephone(trimToNull(payload.get(SettingKey.COMPANY_TELEPHONE.name())));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.FISCAL_TAX_NUMBER.name())) issuer.setTaxNumber(trimToNull(payload.get(SettingKey.FISCAL_TAX_NUMBER.name())));
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.FISCAL_ENVIRONMENT.name())) {
            issuer.setFiscalEnvironment("PROD".equalsIgnoreCase(String.valueOf(payload.get(SettingKey.FISCAL_ENVIRONMENT.name())).trim()) ? "PROD" : "TEST");
        }
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER.name())) {
            issuer.setSoftwareSupplierTaxNumber(trimToNull(payload.get(SettingKey.FISCAL_SOFTWARE_SUPPLIER_TAX_NUMBER.name())));
        }
        if (issuerExclusiveToUnit && payload.containsKey(SettingKey.FISCAL_CERTIFICATE_PASSWORD.name())) {
            String submitted = payload.get(SettingKey.FISCAL_CERTIFICATE_PASSWORD.name());
            if (!isMaskedSecretValue(submitted)) {
                String value = trimToNull(submitted);
                issuer.setCertificatePasswordEncrypted(value == null ? null : crypto.encrypt(value));
            }
        }
        billingIssuerAssignments.save(assignment);

        InvoiceSeries defaultSeries = assignment.getDefaultInvoiceSeries();
        if (defaultSeries == null || defaultSeries.getCompany() == null
                || !companyId.equals(defaultSeries.getCompany().getId())) return;
        if (payload.containsKey(SettingKey.INVOICE_COUNTER.name())) {
            defaultSeries.setNextNumber(nonBlankOrCurrent(payload.get(SettingKey.INVOICE_COUNTER.name()), defaultSeries.getNextNumber()));
        }
        if (payload.containsKey(SettingKey.FISCAL_BUSINESS_PREMISE_ID.name())) {
            defaultSeries.setBusinessPremiseCode(trimToNull(payload.get(SettingKey.FISCAL_BUSINESS_PREMISE_ID.name())));
        }
        if (payload.containsKey(SettingKey.FISCAL_DEVICE_ID.name())) {
            defaultSeries.setElectronicDeviceId(nonBlankOrDefault(payload.get(SettingKey.FISCAL_DEVICE_ID.name()), "1"));
        }
        invoiceSeriesRepository.save(defaultSeries);
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String nonBlankOrDefault(String submitted, String fallback) {
        String normalized = trimToNull(submitted);
        return normalized == null ? fallback : normalized;
    }

    private static String nonBlankOrCurrent(String submitted, String current) {
        String normalized = trimToNull(submitted);
        return normalized == null ? current : normalized;
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
        // Platform-wide settings are read on every /api/settings response. Ask PostgreSQL for
        // the newest row directly instead of loading every tenant's copy and sorting in Java.
        return repository.findLatestByKey(key)
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
        Set<String> selectedCustomFeatures = parseFeatureKeyCsv(
                values.get(SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS.name()));
        boolean customPackage = "CUSTOM".equals(normalizeTenantPackage(tenantPackage));
        Map<String, Map<String, Object>> finalRules = rules;
        MODULE_VISIBILITY_SETTING_KEYS.forEach(moduleKey -> {
            Map<String, Object> rule = finalRules.get(moduleKey);
            if ((!customPackage || selectedCustomFeatures.contains(moduleKey))
                    && moduleVisibleForTenant(moduleKey, rule, tenantPackage, tenantConfigType)) {
                return;
            }
            values.put(moduleKey, "false");
        });
    }

    private void enforceTenantModuleVisibilityOnSave(Long companyId, Map<String, String> normalizedPayload) {
        // Visibility enforcement only depends on subscription metadata and the
        // platform rules. Loading every tenant setting here duplicated the full
        // settings query that save() already performs when returning all(me), and
        // also broke the tenant-isolation interaction contract.
        Map<String, String> effective = new LinkedHashMap<>(normalizedPayload);
        loadStoredSettingIfAbsent(effective, companyId, SettingKey.SIGNUP_PACKAGE_NAME);
        loadStoredSettingIfAbsent(effective, companyId, SettingKey.MODULE_CONFIG_TYPE);
        loadStoredSettingIfAbsent(effective, companyId, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS);
        latestGlobalSettingValue(SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON)
                .ifPresent(v -> effective.put(SettingKey.PLATFORM_MODULE_VISIBILITY_RULES_JSON.name(), v));
        applyPlatformModuleVisibilityRules(effective);
        MODULE_VISIBILITY_SETTING_KEYS.forEach(moduleKey -> {
            if ("false".equalsIgnoreCase(effective.get(moduleKey))) {
                normalizedPayload.put(moduleKey, "false");
            }
        });
    }

    private void loadStoredSettingIfAbsent(
            Map<String, String> values,
            Long companyId,
            SettingKey key
    ) {
        if (values.containsKey(key.name())) return;
        repository.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(value -> decodeForRead(key.name(), value))
                .ifPresent(value -> values.put(key.name(), value));
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
            case "LOCATIONS_ENABLED", "WAITLIST_ENABLED", "CUSTOM_FIELDS_ENABLED", "CONSUMABLES_ENABLED" -> "PREMIUM";
            case "BILLING_ENABLED",
                    "MULTIPLE_COMPANIES_ENABLED",
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
            case "PREMIUM", "BUSINESS", "CUSTOM" -> 3;
            case "PROFESSIONAL", "PRO", "TRIAL" -> 2;
            default -> 1;
        };
    }

    private static String normalizeTenantPackage(String value) {
        String normalized = value == null ? "" : value.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "CUSTOM" -> "CUSTOM";
            case "PREMIUM", "BUSINESS" -> "PREMIUM";
            case "PROFESSIONAL", "PRO", "TRIAL" -> "PROFESSIONAL";
            default -> "BASIC";
        };
    }

    private static Set<String> parseFeatureKeyCsv(String raw) {
        if (raw == null || raw.isBlank()) return Set.of();
        return Arrays.stream(raw.split("[,;\\s]+"))
                .map(String::trim)
                .filter(value -> !value.isBlank())
                .map(value -> value.toUpperCase(Locale.ROOT))
                .collect(java.util.stream.Collectors.toUnmodifiableSet());
    }

    private static String normalizeModuleVisibilityPackage(Object raw) {
        String normalized = raw == null ? "" : String.valueOf(raw).trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "PREMIUM", "BUSINESS" -> "PREMIUM";
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
            case "salon" -> "hair_salon";
            case "gym", "personal_training" -> "fitness_personal_training";
            case "therapy" -> "psychology_counselling";
            case "spa" -> "spa_sauna";
            case "hair_salon", "beauty_salon", "massage", "spa_sauna", "tattooing_piercing",
                 "fitness_personal_training", "physical_therapy", "psychology_counselling",
                 "yoga_pilates", "pet_services", "education_coaching", "other" -> normalized;
            default -> "";
        };
    }

    private static String normalizeModuleConfigType(String raw) {
        String normalized = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return switch (normalized) {
            case "salon" -> "hair_salon";
            case "gym", "personal_training" -> "fitness_personal_training";
            case "therapy" -> "psychology_counselling";
            case "spa" -> "spa_sauna";
            case "hair_salon", "beauty_salon", "massage", "spa_sauna", "tattooing_piercing",
                 "fitness_personal_training", "physical_therapy", "psychology_counselling",
                 "yoga_pilates", "pet_services", "education_coaching", "other" -> normalized;
            default -> "hair_salon";
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
        if (key == SettingKey.GUEST_APP_SETTINGS_JSON) {
            return sanitizeGuestAppSettingsJson(value);
        }
        return value;
    }

    private static String sanitizeGuestAppSettingsJson(String raw) {
        if (raw == null || raw.isBlank()) return "{}";
        try {
            Map<String, Object> parsed = JSON.readValue(raw, new TypeReference<Map<String, Object>>() {});
            if (parsed == null) return "{}";
            LEGACY_GUEST_PUBLIC_IDENTITY_FIELDS.forEach(parsed::remove);
            return JSON.writeValueAsString(parsed);
        } catch (Exception ignored) {
            return "{}";
        }
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
            case "logo", "logoimage", "logoimageurl" -> "companyLogoUrl";
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
