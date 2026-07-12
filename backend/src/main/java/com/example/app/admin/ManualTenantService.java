package com.example.app.admin;

import com.example.app.auth.PasswordResetService;
import com.example.app.auth.SignupWelcomeEmailService;
import com.example.app.company.Company;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.company.CompanyRepository;
import com.example.app.register.PlatformSubscriptionBillingService;
import com.example.app.register.RegisterCatalogService;
import com.example.app.register.RegisterPriceCatalog;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ManualTenantService {
    private static final Set<String> TENANT_TYPES = Set.of("salon", "gym", "therapy", "spa", "personal_training");
    private static final Set<String> ACCESS_STATUSES = Set.of("ACTIVE", "SUSPENDED", "CANCELLED");
    private static final Set<String> BILLING_STATUSES = Set.of("PENDING_PAYMENT", "PAID", "PAST_DUE");

    private static final List<FeatureDefinition> FEATURES = List.of(
            new FeatureDefinition("SPACES_ENABLED", "Spaces / resources", SettingKey.SPACES_ENABLED),
            new FeatureDefinition("TYPES_ENABLED", "Services", SettingKey.TYPES_ENABLED),
            new FeatureDefinition("COURSES_ENABLED", "Courses", SettingKey.COURSES_ENABLED),
            new FeatureDefinition("BOOKABLE_ENABLED", "Bookable sessions", SettingKey.BOOKABLE_ENABLED),
            new FeatureDefinition("ONLINE_SESSION_BOOKING_ENABLED", "Online session booking", SettingKey.ONLINE_SESSION_BOOKING_ENABLED),
            new FeatureDefinition("WEBSITE_WIDGET_ENABLED", "Website widget", SettingKey.WEBSITE_WIDGET_ENABLED),
            new FeatureDefinition("BILLING_ENABLED", "Billing", SettingKey.BILLING_ENABLED),
            new FeatureDefinition("BILLING_INVOICES_ENABLED", "Invoices", SettingKey.BILLING_INVOICES_ENABLED),
            new FeatureDefinition("BILLING_ONLINE_CARD_PAYMENTS_ENABLED", "Online card payments", SettingKey.BILLING_ONLINE_CARD_PAYMENTS_ENABLED),
            new FeatureDefinition("BILLING_BANK_TRANSFER_ENABLED", "Bank transfer payments", SettingKey.BILLING_BANK_TRANSFER_ENABLED),
            new FeatureDefinition("BILLING_PAYPAL_ENABLED", "PayPal payments", SettingKey.BILLING_PAYPAL_ENABLED),
            new FeatureDefinition("BILLING_GIFT_CARDS_ENABLED", "Gift cards", SettingKey.BILLING_GIFT_CARDS_ENABLED),
            new FeatureDefinition("BILLING_FISCAL_CASH_REGISTER_ENABLED", "Fiscal cash register", SettingKey.BILLING_FISCAL_CASH_REGISTER_ENABLED),
            new FeatureDefinition("BILLING_ADVANCE_ENABLED", "Advance payments", SettingKey.BILLING_ADVANCE_ENABLED),
            new FeatureDefinition("COMMUNICATION_ENABLED", "Communication", SettingKey.COMMUNICATION_ENABLED),
            new FeatureDefinition("NOTIFICATIONS_ENABLED", "Notifications", SettingKey.NOTIFICATIONS_ENABLED),
            new FeatureDefinition("NOTIFICATIONS_EMAIL_ALERTS_ENABLED", "Email notifications", SettingKey.NOTIFICATIONS_EMAIL_ALERTS_ENABLED),
            new FeatureDefinition("NOTIFICATIONS_SMS_ALERTS_ENABLED", "SMS notifications", SettingKey.NOTIFICATIONS_SMS_ALERTS_ENABLED),
            new FeatureDefinition("NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED", "Guest app notifications", SettingKey.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED),
            new FeatureDefinition("NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED", "Reminder templates", SettingKey.NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED),
            new FeatureDefinition("INBOX_ENABLED", "Inbox", SettingKey.INBOX_ENABLED),
            new FeatureDefinition("GOOGLE_CALENDAR_MODULE_ENABLED", "Google Calendar", SettingKey.GOOGLE_CALENDAR_MODULE_ENABLED),
            new FeatureDefinition("SCANNER_MODULE_ENABLED", "Scanner", SettingKey.SCANNER_MODULE_ENABLED),
            new FeatureDefinition("WHATSAPP_MODULE_ENABLED", "WhatsApp", SettingKey.WHATSAPP_MODULE_ENABLED),
            new FeatureDefinition("VIBER_MODULE_ENABLED", "Viber", SettingKey.VIBER_MODULE_ENABLED),
            new FeatureDefinition("AI_BOOKING_ENABLED", "AI booking assistant", SettingKey.AI_BOOKING_ENABLED),
            new FeatureDefinition("PERSONAL_ENABLED", "Personal calendar blocks", SettingKey.PERSONAL_ENABLED),
            new FeatureDefinition("TODOS_ENABLED", "Calendar todos", SettingKey.TODOS_ENABLED),
            new FeatureDefinition("NO_SHOW_ENABLED", "No-show handling", SettingKey.NO_SHOW_ENABLED),
            new FeatureDefinition("MULTIPLE_SESSIONS_PER_SPACE_ENABLED", "Multiple sessions per resource", SettingKey.MULTIPLE_SESSIONS_PER_SPACE_ENABLED),
            new FeatureDefinition("MULTIPLE_CLIENTS_PER_SESSION_ENABLED", "Multiple clients per session", SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED),
            new FeatureDefinition("GROUP_BOOKING_ENABLED", "Group booking", SettingKey.GROUP_BOOKING_ENABLED),
            new FeatureDefinition("SECURITY_MODULE_ENABLED", "Security", SettingKey.SECURITY_MODULE_ENABLED),
            new FeatureDefinition("SECURITY_SESSION_SECURITY_ENABLED", "Session security", SettingKey.SECURITY_SESSION_SECURITY_ENABLED),
            new FeatureDefinition("SECURITY_PASSKEYS_ENABLED", "Passkeys", SettingKey.SECURITY_PASSKEYS_ENABLED),
            new FeatureDefinition("SECURITY_API_INTEGRATIONS_ENABLED", "API integrations", SettingKey.SECURITY_API_INTEGRATIONS_ENABLED),
            new FeatureDefinition("guestAppEnabled", "Guest app", null),
            new FeatureDefinition("guestWalletEnabled", "Guest wallet", null),
            new FeatureDefinition("guestOrdersEnabled", "Wallet orders", null),
            new FeatureDefinition("guestBuyTabEnabled", "Wallet buy tab", null),
            new FeatureDefinition("guestEntitlementsEnabled", "Wallet entitlements", null),
            new FeatureDefinition("guestInboxEnabled", "Guest inbox", null)
    );

    private final CompanyRepository companies;
    private final CompanyProvisioningService companyProvisioningService;
    private final UserRepository users;
    private final AppSettingRepository settings;
    private final PasswordEncoder passwordEncoder;
    private final PasswordResetService passwordResetService;
    private final SignupWelcomeEmailService signupWelcomeEmailService;
    private final PlatformSubscriptionBillingService subscriptionBillingService;
    private final PlatformTenancyAdminAuditLogRepository auditLogs;
    private final RegisterCatalogService registerCatalogService;
    private final ObjectMapper objectMapper;

    public ManualTenantService(
            CompanyRepository companies,
            CompanyProvisioningService companyProvisioningService,
            UserRepository users,
            AppSettingRepository settings,
            PasswordEncoder passwordEncoder,
            PasswordResetService passwordResetService,
            SignupWelcomeEmailService signupWelcomeEmailService,
            PlatformSubscriptionBillingService subscriptionBillingService,
            PlatformTenancyAdminAuditLogRepository auditLogs,
            RegisterCatalogService registerCatalogService,
            ObjectMapper objectMapper
    ) {
        this.companies = companies;
        this.companyProvisioningService = companyProvisioningService;
        this.users = users;
        this.settings = settings;
        this.passwordEncoder = passwordEncoder;
        this.passwordResetService = passwordResetService;
        this.signupWelcomeEmailService = signupWelcomeEmailService;
        this.subscriptionBillingService = subscriptionBillingService;
        this.auditLogs = auditLogs;
        this.registerCatalogService = registerCatalogService;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public ManualTenantOptions options() {
        RegisterPriceCatalog catalog = registerCatalogService.mergedCatalog();
        List<ManualTenantAddOnOption> addOns = new ArrayList<>();
        if (catalog.getAddonItems() != null) {
            for (RegisterPriceCatalog.AddonItem item : catalog.getAddonItems()) {
                if (item == null || item.getKey() == null || Boolean.FALSE.equals(item.getActive())) continue;
                addOns.add(new ManualTenantAddOnOption(item.getKey(), item.getName(), item.getNameSl(), item.getMonthly() == null ? BigDecimal.ZERO : money(item.getMonthly())));
            }
        }
        return new ManualTenantOptions(
                FEATURES.stream().map(f -> new ManualTenantFeatureOption(f.key(), f.label())).toList(),
                addOns,
                List.of("salon", "gym", "therapy", "spa", "personal_training")
        );
    }

    @Transactional
    public ManualTenantResponse createManualTenant(ManualTenantRequest request, User actor) {
        if (request == null) throw badRequest("Request body is required.");
        String email = normalizeEmail(request.email());
        if (email == null) throw badRequest("Owner email is required.");
        if (users.existsByEmailIgnoreCase(email)) throw badRequest("A user with this email already exists.");
        String firstName = required(request.firstName(), "First name is required.");
        String lastName = required(request.lastName(), "Last name is required.");
        String companyName = required(request.companyName(), "Company name is required.");
        String tenantType = normalizeTenantType(request.companyType());
        String paymentMethod = normalizePaymentMethod(request.paymentMethod());
        String packageName = normalizePackage(request.packageName());
        String interval = normalizeInterval(request.billingInterval());
        int userCount = positiveInt(request.userCount(), 1);
        int smsCount = nonNegativeInt(request.smsCount(), 0);

        Company company = companyProvisioningService.createWithTenantCode(companyName);
        companyProvisioningService.ensureDefaultPaymentMethods(company);

        User owner = new User();
        owner.setCompany(company);
        owner.setFirstName(firstName);
        owner.setLastName(lastName);
        owner.setEmail(email);
        owner.setPhone(trimToNull(request.phone()));
        owner.setWhatsappSenderNumber(trimToNull(request.phone()));
        owner.setWhatsappPhoneNumberId(trimToNull(request.phone()));
        owner.setPasswordHash(passwordEncoder.encode("Temp#" + UUID.randomUUID().toString().replace("-", "")));
        owner.setRole(Role.ADMIN);
        owner.setActive(true);
        owner.setConsultant(true);
        owner = users.save(owner);

        seedTenantDefaults(company, companyName, tenantType);
        seedBillingAndCompanySettings(company, request, packageName, interval, userCount, smsCount, paymentMethod, true);
        applyFeatureSelection(company, request.enabledFeatureKeys(), packageName);
        seedSetting(company, SettingKey.SIGNUP_OWNER_PASSWORD_PENDING, "true");

        subscriptionBillingService.ensureForSignupTenant(
                company,
                owner,
                companyName,
                request.vatId(),
                request.address(),
                request.postalCode(),
                request.city(),
                packageName,
                interval,
                paymentMethod,
                userCount,
                smsCount,
                addonKeys(request.addOns())
        );
        PlatformSubscriptionBillingService.SignupBillingInvoiceResult invoice = subscriptionBillingService.createInvoiceForSignupTenantIfDue(company);
        if (BillLike.isPaid(invoice.paymentStatus())) {
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_STATUS, "PAID");
        }
        sendManualTenantWelcomeEmailSafely(owner, companyName, packageName, request.language());
        audit(company, actor, "MANUAL_CREATE", "Manual tenant created", "Package: " + packageName + "\nPayment method: " + paymentMethod);
        return new ManualTenantResponse(company.getId(), company.getTenantCode(), company.getName(), email, invoice.billId(), invoice.billNumber(), invoice.checkoutUrl(), setting(company.getId(), SettingKey.TENANCY_ACCESS_STATUS, "ACTIVE"), setting(company.getId(), SettingKey.BILLING_SUBSCRIPTION_STATUS, "PENDING_PAYMENT"));
    }

    @Transactional
    public ManualTenantResponse updateManualSubscription(Long companyId, ManualTenantRequest request, User actor) {
        Company company = companies.findByIdForUpdate(companyId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
        if (request == null) throw badRequest("Request body is required.");
        String packageName = normalizePackage(request.packageName());
        String interval = normalizeInterval(request.billingInterval());
        int userCount = positiveInt(request.userCount(), 1);
        int smsCount = nonNegativeInt(request.smsCount(), 0);
        String paymentMethod = normalizePaymentMethod(request.paymentMethod());
        String oldSummary = subscriptionSummary(company.getId());
        if (request.companyName() != null && !request.companyName().isBlank()) {
            company.setName(request.companyName().trim());
            companies.save(company);
        }
        seedBillingAndCompanySettings(company, request, packageName, interval, userCount, smsCount, paymentMethod, false);
        applyFeatureSelection(company, request.enabledFeatureKeys(), packageName);
        audit(company, actor, "CHANGE_PLAN", "Manual subscription edited", oldSummary + "\n---\n" + subscriptionSummary(company.getId()));
        User owner = users.findFirstByCompanyIdOrderByIdAsc(company.getId()).orElse(null);
        return new ManualTenantResponse(company.getId(), company.getTenantCode(), company.getName(), owner == null ? "" : owner.getEmail(), null, null, null, setting(company.getId(), SettingKey.TENANCY_ACCESS_STATUS, "ACTIVE"), setting(company.getId(), SettingKey.BILLING_SUBSCRIPTION_STATUS, "PENDING_PAYMENT"));
    }

    @Transactional(noRollbackFor = Exception.class)
    public ManualTenantResponse resendPayment(Long tenantId, User actor) {
        Company company = companies.findById(tenantId).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Tenant not found."));
        PlatformSubscriptionBillingService.SignupBillingInvoiceResult invoice = subscriptionBillingService.resendLatestSubscriptionPayment(company);
        audit(company, actor, "MANAGE_ADDONS", "Subscription payment resent", "Bill: " + (invoice.billNumber() == null ? "—" : invoice.billNumber()));
        User owner = users.findFirstByCompanyIdOrderByIdAsc(company.getId()).orElse(null);
        return new ManualTenantResponse(company.getId(), company.getTenantCode(), company.getName(), owner == null ? "" : owner.getEmail(), invoice.billId(), invoice.billNumber(), invoice.checkoutUrl(), setting(company.getId(), SettingKey.TENANCY_ACCESS_STATUS, "ACTIVE"), setting(company.getId(), SettingKey.BILLING_SUBSCRIPTION_STATUS, "PENDING_PAYMENT"));
    }

    private void sendManualTenantWelcomeEmailSafely(User owner, String companyName, String packageName, String localeCode) {
        if (owner == null || owner.getEmail() == null || owner.getEmail().isBlank()) {
            return;
        }
        String setupUrl = passwordResetService.createPasswordSetupUrl(owner, localeCode).orElse(null);
        if (signupWelcomeEmailService == null) {
            passwordResetService.requestReset(owner.getEmail(), localeCode);
            return;
        }
        try {
            signupWelcomeEmailService.sendManualTenantWelcomeEmail(
                    owner.getEmail(),
                    owner.getFirstName(),
                    companyName,
                    packageName,
                    localeCode,
                    setupUrl
            );
        } catch (Exception e) {
            passwordResetService.requestReset(owner.getEmail(), localeCode);
        }
    }

    private void seedBillingAndCompanySettings(Company company, ManualTenantRequest request, String packageName, String interval, int userCount, int smsCount, String paymentMethod, boolean initial) {
        seedSetting(company, SettingKey.COMPANY_NAME, stringOrEmpty(request.companyName()));
        seedSetting(company, SettingKey.COMPANY_EMAIL, normalizeEmail(request.email()) == null ? stringOrEmpty(request.email()) : normalizeEmail(request.email()));
        seedSetting(company, SettingKey.COMPANY_TELEPHONE, stringOrEmpty(request.phone()));
        seedSetting(company, SettingKey.COMPANY_VAT_ID, stringOrEmpty(request.vatId()));
        seedSetting(company, SettingKey.COMPANY_ADDRESS, stringOrEmpty(request.address()));
        seedSetting(company, SettingKey.COMPANY_POSTAL_CODE, stringOrEmpty(request.postalCode()));
        seedSetting(company, SettingKey.COMPANY_CITY, stringOrEmpty(request.city()));
        seedSetting(company, SettingKey.MODULE_CONFIG_TYPE, normalizeTenantType(request.companyType()));
        seedSetting(company, SettingKey.SIGNUP_PACKAGE_NAME, packageName);
        seedSetting(company, SettingKey.SIGNUP_USER_COUNT, String.valueOf(userCount));
        seedSetting(company, SettingKey.SIGNUP_SMS_COUNT, String.valueOf(smsCount));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_NEXT_USER_COUNT, String.valueOf(userCount));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_NEXT_SMS_COUNT, String.valueOf(smsCount));
        seedSetting(company, SettingKey.SIGNUP_ADDON_KEYS, String.join(",", addonKeys(request.addOns())));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS, String.join(",", addonKeys(request.addOns())));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_ADDONS_JSON, toJson(request.addOns()));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, interval);
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_PAYMENT_METHOD, paymentMethod);
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_GRACE_DAYS, "30");
        seedSetting(company, SettingKey.TENANCY_ACCESS_STATUS, normalizeAccessStatus(request.accessStatus(), "ACTIVE"));
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_STATUS, normalizeBillingStatus(request.billingStatus(), "PENDING_PAYMENT"));
        seedSetting(company, SettingKey.MANUAL_TENANT_CREATED, "true");
        if ("CUSTOM".equals(packageName)) {
            String customName = trimToNull(request.customPackageName());
            if (customName == null) customName = "Custom";
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_NAME, customName);
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_MONTHLY_PRICE, moneyString(request.customMonthlyPrice()));
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_YEARLY_PRICE, moneyString(request.customYearlyPrice()));
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS, String.join(",", normalizeFeatureKeys(request.enabledFeatureKeys())));
        } else {
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_NAME, "");
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_MONTHLY_PRICE, "0.00");
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_YEARLY_PRICE, "0.00");
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS, "");
        }
        LocalDate start = parseDateOr(request.subscriptionStart(), LocalDate.now(ZoneId.systemDefault()));
        LocalDate end = "YEARLY".equals(interval) ? start.plusYears(1) : start.plusMonths(1);
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_START, start.toString());
        if (initial || setting(company.getId(), SettingKey.BILLING_SUBSCRIPTION_END, "").isBlank()) {
            seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_END, end.toString());
        }
        seedDefaultEmailSenderSettings(company);
    }

    private void applyFeatureSelection(Company company, List<String> requestedFeatures, String packageName) {
        Set<String> selected = new LinkedHashSet<>(normalizeFeatureKeys(requestedFeatures));
        if (!"CUSTOM".equals(packageName)) {
            selected.addAll(defaultFeaturesFor(packageName));
        }
        for (FeatureDefinition f : FEATURES) {
            if (f.settingKey() != null) {
                seedSetting(company, f.settingKey(), Boolean.toString(selected.contains(f.key())));
            }
        }
        Map<String, Object> guest = new LinkedHashMap<>();
        guest.put("tenantType", setting(company.getId(), SettingKey.MODULE_CONFIG_TYPE, "salon"));
        guest.put("guestAppEnabled", selected.contains("guestAppEnabled"));
        guest.put("walletEnabled", selected.contains("guestWalletEnabled"));
        guest.put("ordersEnabled", selected.contains("guestOrdersEnabled"));
        guest.put("buyTabEnabled", selected.contains("guestBuyTabEnabled"));
        guest.put("entitlementsEnabled", selected.contains("guestEntitlementsEnabled"));
        guest.put("inboxEnabled", selected.contains("guestInboxEnabled"));
        seedSetting(company, SettingKey.GUEST_APP_SETTINGS_JSON, toJsonObject(guest));
        seedSetting(company, SettingKey.WEBSITE_WIDGET_SETTINGS_JSON, "{}");
        companyProvisioningService.ensureDefaultPaymentMethods(company);
    }

    private Set<String> defaultFeaturesFor(String packageName) {
        String pkg = normalizePackage(packageName);
        Set<String> out = new LinkedHashSet<>();
        out.addAll(List.of("TYPES_ENABLED", "BOOKABLE_ENABLED", "ONLINE_SESSION_BOOKING_ENABLED", "WEBSITE_WIDGET_ENABLED", "COMMUNICATION_ENABLED", "NOTIFICATIONS_ENABLED", "NOTIFICATIONS_EMAIL_ALERTS_ENABLED", "NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED", "PERSONAL_ENABLED", "TODOS_ENABLED", "NO_SHOW_ENABLED", "SECURITY_MODULE_ENABLED", "SECURITY_SESSION_SECURITY_ENABLED"));
        if ("PROFESSIONAL".equals(pkg) || "PREMIUM".equals(pkg)) {
            out.addAll(List.of("SPACES_ENABLED", "COURSES_ENABLED", "BILLING_ENABLED", "BILLING_INVOICES_ENABLED", "BILLING_BANK_TRANSFER_ENABLED", "BILLING_ONLINE_CARD_PAYMENTS_ENABLED", "BILLING_ADVANCE_ENABLED", "MULTIPLE_SESSIONS_PER_SPACE_ENABLED", "GROUP_BOOKING_ENABLED", "MULTIPLE_CLIENTS_PER_SESSION_ENABLED", "guestAppEnabled", "guestWalletEnabled", "guestOrdersEnabled", "guestBuyTabEnabled", "guestEntitlementsEnabled"));
        }
        if ("PREMIUM".equals(pkg)) {
            out.addAll(List.of("INBOX_ENABLED", "GOOGLE_CALENDAR_MODULE_ENABLED", "SCANNER_MODULE_ENABLED", "WHATSAPP_MODULE_ENABLED", "AI_BOOKING_ENABLED", "guestInboxEnabled"));
        }
        return out;
    }

    private void seedTenantDefaults(Company company, String companyName, String tenantType) {
        seedSetting(company, SettingKey.MODULE_CONFIG_TYPE, normalizeTenantType(tenantType));
        seedSetting(company, SettingKey.SESSION_LENGTH_MINUTES, "60");
        seedSetting(company, SettingKey.PERSONAL_TASK_PRESETS_JSON, "[]");
        seedSetting(company, SettingKey.INVOICE_COUNTER, "1");
        seedSetting(company, SettingKey.ORDER_COUNTER, "1");
        seedSetting(company, SettingKey.COMPANY_NAME, companyName);
        seedSetting(company, SettingKey.COMPANY_ADDRESS, "");
        seedSetting(company, SettingKey.COMPANY_POSTAL_CODE, "");
        seedSetting(company, SettingKey.COMPANY_CITY, "");
        seedSetting(company, SettingKey.COMPANY_VAT_ID, "");
        seedSetting(company, SettingKey.COMPANY_IBAN, "");
        seedSetting(company, SettingKey.COMPANY_EMAIL, "");
        seedSetting(company, SettingKey.COMPANY_TELEPHONE, "");
        seedSetting(company, SettingKey.PAYMENT_DEADLINE_DAYS, "15");
        seedDefaultEmailSenderSettings(company);
        seedSetting(company, SettingKey.TENANCY_SMS_SENT_COUNT, "0");
        seedSetting(company, SettingKey.TENANCY_SPACE_QUOTA, "1");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT, "0");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT, "0");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS, "");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_UPGRADE_DIFF_AMOUNT, "0");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, "0.00");
        seedSetting(company, SettingKey.BILLING_INVOICES_ENABLED, "false");
        seedSetting(company, SettingKey.BILLING_ONLINE_CARD_PAYMENTS_ENABLED, "false");
        seedSetting(company, SettingKey.BILLING_BANK_TRANSFER_ENABLED, "false");
        seedSetting(company, SettingKey.BILLING_PAYPAL_ENABLED, "false");
        seedSetting(company, SettingKey.BILLING_FISCAL_CASH_REGISTER_ENABLED, "false");
    }

    private void audit(Company company, User actor, String action, String summary, String detail) {
        PlatformTenancyAdminAuditLog row = new PlatformTenancyAdminAuditLog();
        row.setCompany(company);
        row.setActorUser(actor);
        row.setActionType(action);
        row.setSummary(summary);
        row.setDetail(detail);
        auditLogs.save(row);
    }

    private String subscriptionSummary(Long companyId) {
        return "Package: " + setting(companyId, SettingKey.SIGNUP_PACKAGE_NAME, "")
                + "\nInterval: " + setting(companyId, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, "")
                + "\nUsers: " + setting(companyId, SettingKey.SIGNUP_USER_COUNT, "")
                + "\nSMS: " + setting(companyId, SettingKey.SIGNUP_SMS_COUNT, "")
                + "\nAccess: " + setting(companyId, SettingKey.TENANCY_ACCESS_STATUS, "")
                + "\nBilling: " + setting(companyId, SettingKey.BILLING_SUBSCRIPTION_STATUS, "");
    }

    private void seedDefaultEmailSenderSettings(Company company) {
        seedSetting(company, SettingKey.EMAIL_SENDER_MODE, "DEFAULT_CALENDRA");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_FROM_NAME, "");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_FROM_EMAIL, "");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_REPLY_TO_EMAIL, "");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_DOMAIN, "");
        seedSetting(company, SettingKey.EMAIL_CUSTOM_DOMAIN_VERIFICATION_STATUS, "NOT_VERIFIED");
    }

    private void seedSetting(Company company, SettingKey key, String value) {
        settings.findByCompanyIdAndKey(company.getId(), key).ifPresentOrElse(existing -> {
            existing.setValue(value == null ? "" : value);
            settings.save(existing);
        }, () -> {
            AppSetting row = new AppSetting();
            row.setCompany(company);
            row.setKey(key.name());
            row.setValue(value == null ? "" : value);
            settings.save(row);
        });
    }

    private String setting(Long companyId, SettingKey key, String fallback) {
        return settings.findByCompanyIdAndKey(companyId, key).map(AppSetting::getValue).filter(v -> v != null && !v.isBlank()).orElse(fallback);
    }

    private String toJson(List<ManualTenantAddOnRequest> addOns) {
        try { return objectMapper.writeValueAsString(addOns == null ? List.of() : addOns); }
        catch (JsonProcessingException e) { return "[]"; }
    }

    private String toJsonObject(Map<String, Object> value) {
        try { return objectMapper.writeValueAsString(value); }
        catch (JsonProcessingException e) { return "{}"; }
    }

    private List<String> addonKeys(List<ManualTenantAddOnRequest> rows) {
        if (rows == null) return List.of();
        List<String> out = new ArrayList<>();
        for (ManualTenantAddOnRequest row : rows) {
            String key = normalizeKey(row == null ? null : row.key());
            if (!key.isBlank() && !out.contains(key)) out.add(key);
        }
        return out;
    }

    private List<String> normalizeFeatureKeys(List<String> keys) {
        if (keys == null) return List.of();
        Set<String> allowed = new LinkedHashSet<>();
        FEATURES.forEach(f -> allowed.add(f.key()));
        List<String> out = new ArrayList<>();
        for (String raw : keys) {
            String t = raw == null ? "" : raw.trim();
            if (allowed.contains(t) && !out.contains(t)) out.add(t);
        }
        return out;
    }

    private LocalDate parseDateOr(String raw, LocalDate fallback) {
        if (raw == null || raw.isBlank()) return fallback;
        try { return LocalDate.parse(raw.trim()); }
        catch (Exception e) { return fallback; }
    }

    private String normalizeEmail(String raw) {
        if (raw == null) return null;
        String value = raw.trim().toLowerCase(Locale.ROOT);
        return value.contains("@") && value.contains(".") ? value : null;
    }

    private String required(String raw, String message) {
        String t = trimToNull(raw);
        if (t == null) throw badRequest(message);
        return t;
    }

    private ResponseStatusException badRequest(String message) { return new ResponseStatusException(HttpStatus.BAD_REQUEST, message); }

    private String normalizeKey(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
    }

    private String normalizeTenantType(String raw) {
        String value = raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        return TENANT_TYPES.contains(value) ? value : "salon";
    }

    private String normalizePackage(String raw) {
        String u = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replace('-', '_').replace(' ', '_');
        if ("PRO".equals(u)) return "PROFESSIONAL";
        if ("BUSINESS".equals(u)) return "PREMIUM";
        return switch (u) {
            case "BASIC", "PROFESSIONAL", "PREMIUM", "CUSTOM" -> u;
            default -> "PROFESSIONAL";
        };
    }

    private String normalizeInterval(String raw) {
        String u = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replace('-', '_');
        return "YEARLY".equals(u) || "ANNUAL".equals(u) ? "YEARLY" : "MONTHLY";
    }

    private String normalizePaymentMethod(String raw) {
        String u = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replace('-', '_');
        if ("CARD".equals(u) || "STRIPE".equals(u) || "CREDIT_CARD".equals(u)) return "CARD";
        return "BANK_TRANSFER";
    }

    private String normalizeAccessStatus(String raw, String fallback) {
        String u = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        return ACCESS_STATUSES.contains(u) ? u : fallback;
    }

    private String normalizeBillingStatus(String raw, String fallback) {
        String u = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT);
        return BILLING_STATUSES.contains(u) ? u : fallback;
    }

    private int positiveInt(Integer n, int fallback) { return n == null || n < 1 ? fallback : n; }
    private int nonNegativeInt(Integer n, int fallback) { return n == null || n < 0 ? fallback : n; }

    private String moneyString(BigDecimal value) { return (value == null ? BigDecimal.ZERO : value.max(BigDecimal.ZERO)).setScale(2, RoundingMode.HALF_UP).toPlainString(); }
    private BigDecimal money(Double value) { return BigDecimal.valueOf(value == null ? 0.0 : value).setScale(2, RoundingMode.HALF_UP); }
    private String stringOrEmpty(String raw) { return raw == null ? "" : raw.trim(); }
    private String trimToNull(String raw) { if (raw == null) return null; String t = raw.trim(); return t.isBlank() ? null : t; }

    private record FeatureDefinition(String key, String label, SettingKey settingKey) {}
    private static final class BillLike { static boolean isPaid(String s) { return s != null && s.equalsIgnoreCase("paid"); } }

    public record ManualTenantFeatureOption(String key, String label) {}
    public record ManualTenantAddOnOption(String key, String name, String nameSl, BigDecimal monthlyPrice) {}
    public record ManualTenantOptions(List<ManualTenantFeatureOption> features, List<ManualTenantAddOnOption> addOns, List<String> companyTypes) {}
    public record ManualTenantAddOnRequest(String key, BigDecimal monthlyPrice, BigDecimal yearlyPrice, Boolean charged) {}
    public record ManualTenantRequest(
            String firstName,
            String lastName,
            String email,
            String phone,
            String companyName,
            String companyType,
            String vatId,
            String country,
            String city,
            String address,
            String postalCode,
            String packageName,
            String customPackageName,
            BigDecimal customMonthlyPrice,
            BigDecimal customYearlyPrice,
            String billingInterval,
            Integer userCount,
            Integer smsCount,
            List<String> enabledFeatureKeys,
            List<ManualTenantAddOnRequest> addOns,
            String paymentMethod,
            String accessStatus,
            String billingStatus,
            String subscriptionStart,
            String language
    ) {}
    public record ManualTenantResponse(Long tenantId, String tenantCode, String companyName, String email, Long billId, String billNumber, String checkoutUrl, String accessStatus, String billingStatus) {}
}
