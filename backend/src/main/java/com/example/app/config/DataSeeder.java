package com.example.app.config;

import com.example.app.billing.TaxRate;
import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.time.LocalDate;
import java.util.Optional;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

@Component
public class DataSeeder implements CommandLineRunner {
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AppSettingRepository settings;
    private final TransactionServiceRepository txServices;
    private final CompanyRepository companies;
    private final PaymentMethodRepository paymentMethods;
    private final CompanyProvisioningService companyProvisioningService;

    public DataSeeder(UserRepository users, PasswordEncoder encoder, AppSettingRepository settings,
                      TransactionServiceRepository txServices, CompanyRepository companies,
                      PaymentMethodRepository paymentMethods, CompanyProvisioningService companyProvisioningService) {
        this.users = users;
        this.encoder = encoder;
        this.settings = settings;
        this.txServices = txServices;
        this.companies = companies;
        this.paymentMethods = paymentMethods;
        this.companyProvisioningService = companyProvisioningService;
    }

    @Override
    public void run(String... args) {
        seedSuperAdmin();
        seedTenant("Tenant 1", "tenancy1@terminko.eu");
        seedTenant("Tenant 2", "tenancy2@terminko.eu");
        seedTenant("Tenant 3", "tenancy3@terminko.eu");
        seedTenant("CoreGym", "jdukaric@calendra.si");
        seedTenant("Nejc Bracko s.p.", "nbracko@calendra.si");
        seedTenant("Inštitut AVISENSA", "nina@avisensa.com");
        seedTenant("Rudi Inc.", "astraus81@gmail.com");
        seedTenant("Zoom Marketplace", "marketplace@zoom.us");
        seedTenant("Facebook", "developers@facebook.com");

        // Backfill tenant codes for any existing companies created before tenant-code generation was wired into the seeder.
        companies.findAll().forEach(companyProvisioningService::ensureTenantCode);
    }

    private void seedSuperAdmin() {
        final String superAdminEmail = "dmirc@hosp-it.eu";
        final String superAdminPassword = "Admin123!";
        Company platformCompany = companies.findAll().stream()
                .filter(c -> c.getName() != null && c.getName().equalsIgnoreCase("Platform Admin"))
                .findFirst()
                .orElseGet(() -> {
                    var c = new Company();
                    c.setName("Platform Admin");
                    return companies.save(c);
                });

        platformCompany = companyProvisioningService.ensureTenantCode(platformCompany);

        Company finalPlatformCompany = platformCompany;
        Company finalPlatformCompany1 = platformCompany;
        users.findByEmailIgnoreCase(superAdminEmail).ifPresentOrElse(existing -> {
            boolean dirty = false;
            if (existing.getCompany() == null || !existing.getCompany().getId().equals(finalPlatformCompany.getId())) {
                existing.setCompany(finalPlatformCompany);
                dirty = true;
            }
            if (existing.getRole() != Role.SUPER_ADMIN) {
                existing.setRole(Role.SUPER_ADMIN);
                dirty = true;
            }
            if (!encoder.matches(superAdminPassword, existing.getPasswordHash())) {
                existing.setPasswordHash(encoder.encode(superAdminPassword));
                dirty = true;
            }
            if (!existing.isActive()) {
                existing.setActive(true);
                dirty = true;
            }
            if (existing.isConsultant()) {
                existing.setConsultant(false);
                dirty = true;
            }
            if (dirty) users.save(existing);
        }, () -> {
            var u = new User();
            u.setCompany(finalPlatformCompany1);
            u.setFirstName("Platform");
            u.setLastName("Admin");
            u.setEmail(superAdminEmail);
            u.setPasswordHash(encoder.encode(superAdminPassword));
            u.setRole(Role.SUPER_ADMIN);
            u.setActive(true);
            u.setConsultant(false);
            users.save(u);
        });

        seedSetting(platformCompany, SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL, "https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices");
        seedSetting(platformCompany, SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL, "https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices/register");
    }

    private void seedTenant(String tenantName, String adminEmail) {
        Company company = users.findByEmailIgnoreCase(adminEmail)
                .flatMap(u -> u.getCompany() != null ? Optional.of(u.getCompany()) : Optional.empty())
                .orElseGet(() -> companies.findAll().stream()
                        .filter(c -> c.getName() != null && c.getName().equalsIgnoreCase(tenantName))
                        .findFirst()
                        .orElseGet(() -> {
                            var c = new Company();
                            c.setName(tenantName);
                            return companies.save(c);
                        }));

        company = companyProvisioningService.ensureTenantCode(company);

        var companyName = company.getName() != null && !company.getName().isBlank() ? company.getName() : tenantName;

        Company finalCompany = company;
        Company finalCompany1 = company;
        users.findByEmailIgnoreCase(adminEmail).ifPresentOrElse(existing -> {
            boolean dirty = false;

            if (existing.getCompany() == null || !existing.getCompany().getId().equals(finalCompany.getId())) {
                existing.setCompany(finalCompany);
                dirty = true;
            }

            if (existing.getRole() != Role.ADMIN) {
                existing.setRole(Role.ADMIN);
                dirty = true;
            }

            // Keep demo credentials usable in dev environments.
            if (!encoder.matches("Admin123!", existing.getPasswordHash())) {
                existing.setPasswordHash(encoder.encode("Admin123!"));
                dirty = true;
            }

            if (!existing.isActive()) {
                existing.setActive(true);
                dirty = true;
            }

            if (!existing.isConsultant()) {
                existing.setConsultant(true);
                dirty = true;
            }

            if (dirty) {
                users.save(existing);
            }
        }, () -> {
            var u = new User();
            u.setCompany(finalCompany1);
            u.setFirstName("System");
            u.setLastName("Admin");
            u.setEmail(adminEmail);
            u.setPasswordHash(encoder.encode("Admin123!"));
            u.setRole(Role.ADMIN);
            u.setActive(true);
            u.setConsultant(true);
            users.save(u);
        });

        // Seed settings for this tenant.
        seedSetting(company, SettingKey.SPACES_ENABLED, "true");
        seedSetting(company, SettingKey.TYPES_ENABLED, "true");
        seedSetting(company, SettingKey.BOOKABLE_ENABLED, "true");
        seedSetting(company, SettingKey.AI_BOOKING_ENABLED, "true");
        seedSetting(company, SettingKey.PERSONAL_ENABLED, "true");
        seedSetting(company, SettingKey.TODOS_ENABLED, "true");
        seedSetting(company, SettingKey.MULTIPLE_SESSIONS_PER_SPACE_ENABLED, "false");
        seedSetting(company, SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED, "false");
        seedSetting(company, SettingKey.GROUP_BOOKING_ENABLED, "false");
        seedSetting(company, SettingKey.SESSION_LENGTH_MINUTES, "60");
        seedSetting(company, SettingKey.WORKING_HOURS_START, "05:00");
        seedSetting(company, SettingKey.WORKING_HOURS_END, "23:00");
        seedSetting(company, SettingKey.PERSONAL_TASK_PRESETS_JSON, "[]");
        seedSetting(company, SettingKey.INVOICE_COUNTER, "1");
        seedSetting(company, SettingKey.COMPANY_NAME, companyName);
        seedSetting(company, SettingKey.COMPANY_ADDRESS, "Street 1");
        seedSetting(company, SettingKey.COMPANY_POSTAL_CODE, "1000");
        seedSetting(company, SettingKey.COMPANY_CITY, "Ljubljana");
        seedSetting(company, SettingKey.COMPANY_VAT_ID, "SI00000000");
        seedSetting(company, SettingKey.COMPANY_IBAN, "SI56000000000000000");
        seedSetting(company, SettingKey.COMPANY_EMAIL, "");
        seedSetting(company, SettingKey.COMPANY_TELEPHONE, "");
        seedSetting(company, SettingKey.PAYMENT_DEADLINE_DAYS, "15");
        seedSetting(company, SettingKey.SIGNUP_PACKAGE_NAME, "PROFESSIONAL");
        seedSetting(company, SettingKey.SIGNUP_USER_COUNT, "10");
        seedSetting(company, SettingKey.SIGNUP_SMS_COUNT, "500");
        seedSetting(company, SettingKey.TENANCY_SPACE_QUOTA, "10");
        seedSetting(company, SettingKey.TENANCY_SMS_SENT_COUNT, "0");
        LocalDate subStart = LocalDate.now();
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_START, subStart.toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_END, subStart.plusMonths(1).toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, "MONTHLY");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, "0.00");

        // Ensure at least one payment method exists.
        var methods = paymentMethods.findAllByCompanyIdOrderByNameAsc(company.getId());
        if (methods.isEmpty()) {
            var cash = new PaymentMethod();
            cash.setCompany(company);
            cash.setName("Cash");
            cash.setPaymentType(PaymentType.CASH);
            cash.setFiscalized(true);
            cash.setStripeEnabled(false);
            paymentMethods.save(cash);
        }

        // Ensure default billing transaction service exists for this tenant.
        var txList = txServices.findAllByCompanyId(company.getId());
        var tx = txList.stream().filter(s -> s.getCode().equalsIgnoreCase("CONSULT-001")).findFirst().orElse(null);
        if (tx == null) {
            var s = new TransactionService();
            s.setCompany(company);
            s.setCode("CONSULT-001");
            s.setDescription("Consultation");
            s.setTaxRate(TaxRate.VAT_22);
            s.setNetPrice(new java.math.BigDecimal("50.00"));
            tx = txServices.save(s);
        }
    }

    private void seedSetting(Company company, SettingKey key, String value) {
        if (settings.findByCompanyIdAndKey(company.getId(), key).isEmpty()) {
            var s = new AppSetting();
            s.setCompany(company);
            s.setKey(key.name());
            s.setValue(value);
            settings.save(s);
        }
    }
}
