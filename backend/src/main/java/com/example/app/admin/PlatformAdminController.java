package com.example.app.admin;

import com.example.app.billing.Bill;
import com.example.app.billing.BillRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.register.RegisterCatalogService;
import com.example.app.register.RegisterPriceCatalog;
import com.example.app.session.SpaceRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.stripe.StripePlatformSettingsService;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/platform-admin")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class PlatformAdminController {
    private static final String TEST_INVOICE_DEFAULT = "https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices";
    private static final String TEST_PREMISE_DEFAULT = "https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices/register";
    private static final String PROD_INVOICE_DEFAULT = "https://blagajne.fu.gov.si:9003/v1/cash_registers/invoices";
    private static final String PROD_PREMISE_DEFAULT = "https://blagajne.fu.gov.si:9003/v1/cash_registers/invoices/register";

    private static final Set<String> ALLOWED_PLATFORM_TENANCY_AUDIT_ACTIONS = Set.of(
            "CHANGE_PLAN", "PRICE_OVERRIDE", "SUSPEND_TENANT", "MANAGE_ADDONS", "DELETE_TENANT", "MANUAL_CREATE");

    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final UserRepository users;
    private final SpaceRepository spaces;
    private final BillRepository bills;
    private final RegisterCatalogService registerCatalogService;
    private final PlatformTenancyAdminAuditLogRepository tenancyAdminAuditLogs;
    private final StripePlatformSettingsService stripePlatformSettingsService;
    private final PlatformTenancyDeletionService tenancyDeletionService;
    private final ManualTenantService manualTenantService;

    public PlatformAdminController(
            CompanyRepository companies,
            AppSettingRepository settings,
            UserRepository users,
            SpaceRepository spaces,
            BillRepository bills,
            RegisterCatalogService registerCatalogService,
            PlatformTenancyAdminAuditLogRepository tenancyAdminAuditLogs,
            StripePlatformSettingsService stripePlatformSettingsService,
            PlatformTenancyDeletionService tenancyDeletionService,
            ManualTenantService manualTenantService) {
        this.companies = companies;
        this.settings = settings;
        this.users = users;
        this.spaces = spaces;
        this.bills = bills;
        this.registerCatalogService = registerCatalogService;
        this.tenancyAdminAuditLogs = tenancyAdminAuditLogs;
        this.stripePlatformSettingsService = stripePlatformSettingsService;
        this.tenancyDeletionService = tenancyDeletionService;
        this.manualTenantService = manualTenantService;
    }

    public record TenancyRow(Long id, String tenantCode, String name) {}

    public record TenancySearchHit(
            long id,
            String tenantCode,
            String companyName,
            String contactEmail,
            String packageType,
            String subscriptionInterval,
            String signupCompletionSummary) {}

    public record TenancyDetailsDto(
            long id,
            String companyName,
            String contactName,
            String contactEmail,
            String contactPhone,
            String companyAddress,
            String companyPostalCode,
            String companyCity,
            String createdAt,
            String subscriptionStart,
            String subscriptionEnd,
            int usersCreated,
            Integer usersPaidTotal,
            int spacesCreated,
            Integer spacesTotal,
            int smsSent,
            Integer smsQuota,
            String packageType,
            String subscriptionInterval,
            String dueAmount,
            String tenantCode,
            boolean ownerPasswordSetupPending,
            String signupCompletionSummary,
            String vatId,
            String stripeCustomerIdPreview,
            String accessStatus,
            String billingStatus,
            String customPackageName,
            String customMonthlyPrice,
            String customYearlyPrice,
            String customFeatureKeys,
            String customAddonsJson,
            String paymentMethod,
            String companyType) {}

    public record AuditLogEntryDto(String occurredAt, String category, String summary, String detail, String actorEmail) {}

    public record CreatePlatformTenancyAuditRequest(String actionType, String summary, String detail, String reason) {}

    public record DeleteTenancyRequest(String reason) {}

    @GetMapping("/register-prices")
    public RegisterPriceCatalog registerPrices(@AuthenticationPrincipal User me) {
        return registerCatalogService.readForCompany(me.getCompany().getId());
    }

    @PutMapping("/register-prices")
    public RegisterPriceCatalog saveRegisterPrices(
            @AuthenticationPrincipal User me, @RequestBody RegisterPriceCatalog body) {
        return registerCatalogService.saveForCompany(me.getCompany().getId(), me, body);
    }

    @GetMapping("/payment-providers/stripe")
    public StripePlatformSettingsService.PlatformStripeSettingsDto stripePaymentProviderSettings() {
        return stripePlatformSettingsService.readForAdmin();
    }

    @PutMapping("/payment-providers/stripe")
    public StripePlatformSettingsService.PlatformStripeSettingsDto saveStripePaymentProviderSettings(
            @AuthenticationPrincipal User me,
            @RequestBody StripePlatformSettingsService.PlatformStripeSettingsDto body
    ) {
        return stripePlatformSettingsService.saveForAdmin(me.getCompany(), body);
    }

    @GetMapping("/tenancies")
    public List<TenancyRow> tenancies() {
        return companies.findAll().stream()
                .map(c -> new TenancyRow(c.getId(), c.getTenantCode(), c.getName()))
                .sorted(java.util.Comparator.comparing(TenancyRow::name, String.CASE_INSENSITIVE_ORDER))
                .collect(Collectors.toList());
    }

    @GetMapping("/tenancies/manual-options")
    public ManualTenantService.ManualTenantOptions manualTenantOptions() {
        return manualTenantService.options();
    }

    @PostMapping("/tenancies/manual")
    @ResponseStatus(HttpStatus.CREATED)
    public ManualTenantService.ManualTenantResponse createManualTenant(
            @RequestBody ManualTenantService.ManualTenantRequest body,
            @AuthenticationPrincipal User actor
    ) {
        return manualTenantService.createManualTenant(body, actor);
    }

    @PutMapping("/tenancies/{id}/manual-subscription")
    public ManualTenantService.ManualTenantResponse updateManualTenantSubscription(
            @PathVariable Long id,
            @RequestBody ManualTenantService.ManualTenantRequest body,
            @AuthenticationPrincipal User actor
    ) {
        return manualTenantService.updateManualSubscription(id, body, actor);
    }

    @PostMapping("/tenancies/{id}/resend-subscription-payment")
    public ManualTenantService.ManualTenantResponse resendSubscriptionPayment(
            @PathVariable Long id,
            @AuthenticationPrincipal User actor
    ) {
        return manualTenantService.resendPayment(id, actor);
    }

    /**
     * Search tenancies by company name, tenant code, owner/user email, VAT ID (company setting), or Stripe-related
     * identifiers on bills (customer id, invoice id, checkout session id, payment intent id).
     */
    @GetMapping("/tenancies/search")
    public List<TenancySearchHit> searchTenancies(@RequestParam(value = "q", required = false) String q) {
        String needle = sanitizeSearchNeedle(q);
        if (needle.isBlank()) {
            return List.of();
        }
        Set<Long> ids = new LinkedHashSet<>();
        companies.findIdsByNameOrTenantCodeContainingIgnoreCase(needle).forEach(ids::add);
        users.findDistinctCompanyIdsByEmailContainingIgnoreCase(needle).forEach(ids::add);
        settings.findCompanyIdsByKeyAndValueContainingIgnoreCase(SettingKey.COMPANY_VAT_ID.name(), needle)
                .forEach(ids::add);
        bills.findDistinctCompanyIdsByStripeFieldsContainingIgnoreCase(needle).forEach(ids::add);
        if (needle.chars().allMatch(Character::isDigit)) {
            try {
                long numericId = Long.parseLong(needle);
                companies.findById(numericId).ifPresent(c -> ids.add(c.getId()));
            } catch (NumberFormatException ignored) {
                // ignore overflow
            }
        }
        if (ids.isEmpty()) {
            return List.of();
        }
        List<Company> matches = companies.findAllById(ids).stream()
                .sorted(Comparator.comparing(Company::getName, String.CASE_INSENSITIVE_ORDER))
                .toList();
        return matches.stream().map(this::toSearchHit).toList();
    }

    @GetMapping("/tenancies/{id}")
    public TenancyDetailsDto tenancyDetails(@PathVariable Long id) {
        Company company = companies.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return buildTenancyDetails(company);
    }

    /**
     * Immutable-style log of actions taken from the platform admin console for this tenancy (change plan, price
     * override, suspend, add-ons, etc.).
     */
    @GetMapping("/tenancies/{id}/audit-log")
    public List<AuditLogEntryDto> tenancyAuditLog(@PathVariable Long id) {
        companies.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        return tenancyAdminAuditLogs.findRecentByCompanyId(id, PageRequest.of(0, 200)).stream()
                .map(this::toAuditLogDto)
                .toList();
    }

    @PostMapping("/tenancies/{id}/audit-log")
    public AuditLogEntryDto appendTenancyAuditLog(
            @PathVariable Long id,
            @RequestBody CreatePlatformTenancyAuditRequest body,
            @AuthenticationPrincipal User actor) {
        Company company = companies.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        if (body == null || body.actionType() == null || body.actionType().isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "actionType is required");
        }
        String action = body.actionType().trim().toUpperCase(Locale.ROOT);
        if (!ALLOWED_PLATFORM_TENANCY_AUDIT_ACTIONS.contains(action)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported actionType");
        }
        String summary = clampText(body.summary(), 500);
        if (summary.isBlank()) {
            summary = "Recorded action";
        }
        String detail = clampText(body.detail(), 8000);
        String reason = clampText(body.reason(), 4000);

        PlatformTenancyAdminAuditLog row = new PlatformTenancyAdminAuditLog();
        row.setCompany(company);
        row.setActorUser(actor);
        row.setActionType(action);
        row.setSummary(summary);
        row.setDetail(detail.isBlank() ? null : detail);
        row.setReason(reason.isBlank() ? null : reason);
        tenancyAdminAuditLogs.save(row);
        return toAuditLogDto(row);
    }

    @DeleteMapping("/tenancies/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    public void deleteTenancy(
            @PathVariable Long id,
            @RequestBody(required = false) DeleteTenancyRequest body,
            @AuthenticationPrincipal User actor) {
        String reason = body == null || body.reason() == null ? "" : body.reason().trim();
        if (reason.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "reason is required");
        }
        tenancyDeletionService.deleteTenancy(id, actor, reason);
    }

    private TenancySearchHit toSearchHit(Company company) {
        TenancyDetailsDto full = buildTenancyDetails(company);
        return new TenancySearchHit(
                full.id(),
                full.tenantCode(),
                full.companyName(),
                full.contactEmail(),
                full.packageType(),
                full.subscriptionInterval(),
                full.signupCompletionSummary());
    }

    private TenancyDetailsDto buildTenancyDetails(Company company) {
        Long cid = company.getId();

        User primary = users.findAllByCompanyId(cid).stream()
                .min(Comparator.comparing(User::getId))
                .orElse(null);
        String contactName = primary == null ? "" : (primary.getFirstName() + " " + primary.getLastName()).trim();
        String contactEmail = primary == null || primary.getEmail() == null ? "" : primary.getEmail().trim();
        if (contactEmail.isBlank()) {
            contactEmail = settingTrim(cid, SettingKey.COMPANY_EMAIL);
        }

        String subscriptionStart = settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_START);
        String subscriptionEnd = settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_END);
        String subscriptionInterval = settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_INTERVAL);
        if (subscriptionInterval.isBlank()) {
            subscriptionInterval = "MONTHLY";
        }

        Integer usersPaidTotal = parseInteger(settingTrim(cid, SettingKey.SIGNUP_USER_COUNT));
        Integer spacesTotal = parseInteger(settingTrim(cid, SettingKey.TENANCY_SPACE_QUOTA));
        Integer smsQuota = parseInteger(settingTrim(cid, SettingKey.SIGNUP_SMS_COUNT));
        int smsSent = parseIntegerOrZero(settingTrim(cid, SettingKey.TENANCY_SMS_SENT_COUNT));

        String phone = settingTrim(cid, SettingKey.COMPANY_TELEPHONE);
        String companyAddress = settingTrim(cid, SettingKey.COMPANY_ADDRESS);
        String companyPostalCode = settingTrim(cid, SettingKey.COMPANY_POSTAL_CODE);
        String companyCity = settingTrim(cid, SettingKey.COMPANY_CITY);
        String tenantCode = company.getTenantCode() == null ? "" : company.getTenantCode().trim();
        String vatId = settingTrim(cid, SettingKey.COMPANY_VAT_ID);
        boolean ownerPasswordPending = settings.findByCompanyIdAndKey(cid, SettingKey.SIGNUP_OWNER_PASSWORD_PENDING)
                .map(s -> "true".equalsIgnoreCase(s.getValue()))
                .orElse(false);
        String signupSummary = buildSignupCompletionSummary(ownerPasswordPending, vatId);
        String stripePreview = resolveRecentStripeCustomerId(cid);

        return new TenancyDetailsDto(
                cid,
                company.getName() == null ? "" : company.getName(),
                contactName,
                contactEmail,
                phone,
                companyAddress,
                companyPostalCode,
                companyCity,
                company.getCreatedAt() == null ? "" : company.getCreatedAt().toString(),
                subscriptionStart,
                subscriptionEnd,
                (int) users.countByCompanyId(cid),
                usersPaidTotal,
                (int) spaces.countByCompanyId(cid),
                spacesTotal,
                smsSent,
                smsQuota,
                normalizePackageType(settingTrim(cid, SettingKey.SIGNUP_PACKAGE_NAME)),
                subscriptionInterval,
                settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT).isBlank()
                        ? "0.00"
                        : settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT),
                tenantCode,
                ownerPasswordPending,
                signupSummary,
                vatId,
                stripePreview,
                settingTrim(cid, SettingKey.TENANCY_ACCESS_STATUS).isBlank() ? "ACTIVE" : settingTrim(cid, SettingKey.TENANCY_ACCESS_STATUS),
                settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_STATUS).isBlank() ? "PENDING_PAYMENT" : settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_STATUS),
                settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_NAME),
                settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_MONTHLY_PRICE),
                settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_YEARLY_PRICE),
                settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_FEATURE_KEYS),
                settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_ADDONS_JSON),
                settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_PAYMENT_METHOD),
                settingTrim(cid, SettingKey.MODULE_CONFIG_TYPE));
    }

    private static String buildSignupCompletionSummary(boolean ownerPasswordPending, String vatId) {
        if (ownerPasswordPending) {
            return "Incomplete: owner password setup pending";
        }
        if (vatId == null || vatId.isBlank()) {
            return "Active — no VAT on file (billing profile may be incomplete)";
        }
        return "Active — signup complete";
    }

    private String resolveRecentStripeCustomerId(Long companyId) {
        List<Bill> recent = bills.findTop8ByCompany_IdOrderByIdDesc(companyId);
        for (Bill b : recent) {
            if (b.getStripeCustomerId() != null && !b.getStripeCustomerId().isBlank()) {
                return b.getStripeCustomerId().trim();
            }
        }
        return "";
    }

    private static String sanitizeSearchNeedle(String raw) {
        if (raw == null) {
            return "";
        }
        String t = raw.trim();
        if (t.isBlank()) {
            return "";
        }
        return t.replace("%", "").replace("_", "").replace("\\", "");
    }

    @GetMapping("/settings")
    public Map<String, String> settings(@AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        return Map.ofEntries(
                Map.entry(SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL.name(),
                        get(companyId, SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL, TEST_INVOICE_DEFAULT)),
                Map.entry(SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL.name(),
                        get(companyId, SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL, TEST_PREMISE_DEFAULT)),
                Map.entry(SettingKey.GLOBAL_FISCAL_PROD_INVOICE_URL.name(),
                        get(companyId, SettingKey.GLOBAL_FISCAL_PROD_INVOICE_URL, PROD_INVOICE_DEFAULT)),
                Map.entry(SettingKey.GLOBAL_FISCAL_PROD_PREMISE_URL.name(),
                        get(companyId, SettingKey.GLOBAL_FISCAL_PROD_PREMISE_URL, PROD_PREMISE_DEFAULT)),
                Map.entry(SettingKey.GLOBAL_MESSAGING_WHATSAPP_ENABLED.name(),
                        get(companyId, SettingKey.GLOBAL_MESSAGING_WHATSAPP_ENABLED, "false")),
                Map.entry(SettingKey.GLOBAL_MESSAGING_VIBER_ENABLED.name(),
                        get(companyId, SettingKey.GLOBAL_MESSAGING_VIBER_ENABLED, "false")),
                Map.entry(SettingKey.GLOBAL_PAYMENTS_STRIPE_ENABLED.name(),
                        get(companyId, SettingKey.GLOBAL_PAYMENTS_STRIPE_ENABLED, "true")),
                Map.entry(SettingKey.GLOBAL_PAYMENTS_PAYPAL_ENABLED.name(),
                        get(companyId, SettingKey.GLOBAL_PAYMENTS_PAYPAL_ENABLED, "false")),
                Map.entry(SettingKey.GLOBAL_AJPES_PRS_ENABLED.name(),
                        get(companyId, SettingKey.GLOBAL_AJPES_PRS_ENABLED, "false")),
                Map.entry(SettingKey.GLOBAL_CONSUMABLES_ENABLED.name(),
                        get(companyId, SettingKey.GLOBAL_CONSUMABLES_ENABLED, "false"))
        );
    }

    @PutMapping("/settings")
    public Map<String, String> saveSettings(@RequestBody Map<String, String> payload, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        save(companyId, me, SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL, payload.get(SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL.name()));
        save(companyId, me, SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL, payload.get(SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL.name()));
        save(companyId, me, SettingKey.GLOBAL_FISCAL_PROD_INVOICE_URL, payload.get(SettingKey.GLOBAL_FISCAL_PROD_INVOICE_URL.name()));
        save(companyId, me, SettingKey.GLOBAL_FISCAL_PROD_PREMISE_URL, payload.get(SettingKey.GLOBAL_FISCAL_PROD_PREMISE_URL.name()));
        save(companyId, me, SettingKey.GLOBAL_MESSAGING_WHATSAPP_ENABLED, payload.get(SettingKey.GLOBAL_MESSAGING_WHATSAPP_ENABLED.name()));
        save(companyId, me, SettingKey.GLOBAL_MESSAGING_VIBER_ENABLED, payload.get(SettingKey.GLOBAL_MESSAGING_VIBER_ENABLED.name()));
        save(companyId, me, SettingKey.GLOBAL_PAYMENTS_STRIPE_ENABLED, payload.get(SettingKey.GLOBAL_PAYMENTS_STRIPE_ENABLED.name()));
        save(companyId, me, SettingKey.GLOBAL_PAYMENTS_PAYPAL_ENABLED, payload.get(SettingKey.GLOBAL_PAYMENTS_PAYPAL_ENABLED.name()));
        save(companyId, me, SettingKey.GLOBAL_AJPES_PRS_ENABLED, payload.get(SettingKey.GLOBAL_AJPES_PRS_ENABLED.name()));
        save(companyId, me, SettingKey.GLOBAL_CONSUMABLES_ENABLED, payload.get(SettingKey.GLOBAL_CONSUMABLES_ENABLED.name()));
        return settings(me);
    }

    private String get(Long companyId, SettingKey key, String fallback) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(s -> s.getValue() == null ? "" : s.getValue().trim())
                .filter(v -> !v.isBlank())
                .orElse(fallback);
    }

    private void save(Long companyId, User me, SettingKey key, String value) {
        if (value == null) return;
        AppSetting s = settings.findByCompanyIdAndKey(companyId, key).orElseGet(() -> {
            var ns = new AppSetting();
            ns.setCompany(me.getCompany());
            ns.setKey(key.name());
            return ns;
        });
        s.setValue(value.trim());
        settings.save(s);
    }

    private String settingTrim(Long companyId, SettingKey key) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(v -> v == null ? "" : v.trim())
                .orElse("");
    }

    private static Integer parseInteger(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            return Integer.parseInt(raw.trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static int parseIntegerOrZero(String raw) {
        Integer n = parseInteger(raw);
        return n == null ? 0 : n;
    }

    private AuditLogEntryDto toAuditLogDto(PlatformTenancyAdminAuditLog e) {
        String actor = "";
        if (e.getActorUser() != null && e.getActorUser().getEmail() != null) {
            actor = e.getActorUser().getEmail().trim();
        }
        String d = e.getDetail() == null ? "" : e.getDetail().trim();
        if (e.getReason() != null && !e.getReason().isBlank()) {
            if (!d.isEmpty()) {
                d += "\n";
            }
            d += "Reason: " + e.getReason().trim();
        }
        return new AuditLogEntryDto(
                e.getCreatedAt() == null ? "" : e.getCreatedAt().toString(),
                humanizeTenancyAuditAction(e.getActionType()),
                e.getSummary() == null ? "" : e.getSummary(),
                d,
                actor);
    }

    private static String humanizeTenancyAuditAction(String code) {
        if (code == null || code.isBlank()) {
            return "Platform admin";
        }
        return switch (code) {
            case "CHANGE_PLAN" -> "Change plan";
            case "PRICE_OVERRIDE" -> "Price override";
            case "SUSPEND_TENANT" -> "Suspend tenant";
            case "MANAGE_ADDONS" -> "Manage add-ons";
            case "DELETE_TENANT" -> "Delete tenant";
            case "MANUAL_CREATE" -> "Manual tenant";
            default -> code;
        };
    }

    private static String clampText(String raw, int maxLen) {
        if (raw == null) {
            return "";
        }
        String t = raw.trim();
        if (t.length() <= maxLen) {
            return t;
        }
        return t.substring(0, maxLen - 1) + "…";
    }

    private static String normalizePackageType(String raw) {
        if (raw == null || raw.isBlank()) {
            return "CUSTOM";
        }
        String u = raw.toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        if ("PRO".equals(u)) {
            return "PROFESSIONAL";
        }
        if ("TRIAL".equals(u) || "BASIC".equals(u) || "PROFESSIONAL".equals(u) || "PREMIUM".equals(u) || "CUSTOM".equals(u)) {
            return u;
        }
        return u.length() > 24 ? "CUSTOM" : u;
    }
}
