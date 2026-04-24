package com.example.app.admin;

import com.example.app.billing.Bill;
import com.example.app.billing.BillRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.session.SpaceRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
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

    private final CompanyRepository companies;
    private final AppSettingRepository settings;
    private final UserRepository users;
    private final SpaceRepository spaces;
    private final BillRepository bills;

    public PlatformAdminController(
            CompanyRepository companies,
            AppSettingRepository settings,
            UserRepository users,
            SpaceRepository spaces,
            BillRepository bills) {
        this.companies = companies;
        this.settings = settings;
        this.users = users;
        this.spaces = spaces;
        this.bills = bills;
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
            String stripeCustomerIdPreview) {}

    @GetMapping("/tenancies")
    public List<TenancyRow> tenancies() {
        return companies.findAll().stream()
                .map(c -> new TenancyRow(c.getId(), c.getTenantCode(), c.getName()))
                .sorted(java.util.Comparator.comparing(TenancyRow::name, String.CASE_INSENSITIVE_ORDER))
                .collect(Collectors.toList());
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
                stripePreview);
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
        return Map.of(
                SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL.name(),
                get(companyId, SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL, TEST_INVOICE_DEFAULT),
                SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL.name(),
                get(companyId, SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL, TEST_PREMISE_DEFAULT)
        );
    }

    @PutMapping("/settings")
    public Map<String, String> saveSettings(@RequestBody Map<String, String> payload, @AuthenticationPrincipal User me) {
        Long companyId = me.getCompany().getId();
        save(companyId, me, SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL, payload.get(SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL.name()));
        save(companyId, me, SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL, payload.get(SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL.name()));
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
