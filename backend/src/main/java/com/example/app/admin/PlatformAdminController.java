package com.example.app.admin;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.session.SpaceRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.stream.Collectors;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
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

    public PlatformAdminController(
            CompanyRepository companies,
            AppSettingRepository settings,
            UserRepository users,
            SpaceRepository spaces) {
        this.companies = companies;
        this.settings = settings;
        this.users = users;
        this.spaces = spaces;
    }

    public record TenancyRow(Long id, String tenantCode, String name) {}

    public record UpdateTenancyPackageRequest(String packageType) {}

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
            String dueAmount) {}

    @GetMapping("/tenancies")
    public List<TenancyRow> tenancies() {
        return companies.findAll().stream()
                .map(c -> new TenancyRow(c.getId(), c.getTenantCode(), c.getName()))
                .sorted(java.util.Comparator.comparing(TenancyRow::name, String.CASE_INSENSITIVE_ORDER))
                .collect(Collectors.toList());
    }

    @GetMapping("/tenancies/{id}")
    public TenancyDetailsDto tenancyDetails(@PathVariable Long id) {
        Company company = companies.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
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
                        : settingTrim(cid, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT));
    }

    @PutMapping("/tenancies/{id}/package-type")
    public TenancyDetailsDto updateTenancyPackage(
            @PathVariable Long id, @RequestBody UpdateTenancyPackageRequest body) {
        if (body == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Request body is required");
        }
        Company company = companies.findById(id).orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND));
        String allowed = parseAllowedPackageType(body.packageType());
        savePackageSetting(company, allowed);
        return tenancyDetails(id);
    }

    private void savePackageSetting(Company company, String packageType) {
        Long companyId = company.getId();
        AppSetting s = settings.findByCompanyIdAndKey(companyId, SettingKey.SIGNUP_PACKAGE_NAME).orElseGet(() -> {
            var ns = new AppSetting();
            ns.setCompany(company);
            ns.setKey(SettingKey.SIGNUP_PACKAGE_NAME.name());
            return ns;
        });
        s.setValue(packageType);
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

    /** Accepts only known package codes; rejects unknown values (unlike {@link #normalizePackageType} for reads). */
    private static String parseAllowedPackageType(String raw) {
        if (raw == null || raw.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "packageType is required");
        }
        String u = raw.trim().toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        if ("PRO".equals(u)) {
            u = "PROFESSIONAL";
        }
        if ("TRIAL".equals(u)
                || "BASIC".equals(u)
                || "PROFESSIONAL".equals(u)
                || "PREMIUM".equals(u)
                || "CUSTOM".equals(u)) {
            return u;
        }
        throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid packageType");
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
}
