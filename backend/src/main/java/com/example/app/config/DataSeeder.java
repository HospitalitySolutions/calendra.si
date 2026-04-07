package com.example.app.config;

import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.company.TenantCodeService;
import com.example.app.session.SessionType;
import com.example.app.session.SessionTypeRepository;
import com.example.app.session.TypeTransactionService;
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
    private final TenantCodeService tenantCodeService;
    private final AppSettingRepository settings;
    private final SessionTypeRepository types;
    private final TransactionServiceRepository txServices;
    private final CompanyRepository companies;
    private final PaymentMethodRepository paymentMethods;

    public DataSeeder(
            UserRepository users,
            PasswordEncoder encoder,
            AppSettingRepository settings,
            SessionTypeRepository types,
            TransactionServiceRepository txServices,
            CompanyRepository companies,
            PaymentMethodRepository paymentMethods,
            TenantCodeService tenantCodeService) {
        this.users = users;
        this.encoder = encoder;
        this.tenantCodeService = tenantCodeService;
        this.settings = settings;
        this.types = types;
        this.txServices = txServices;
        this.companies = companies;
        this.paymentMethods = paymentMethods;
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
        final Company platformCompanyRef = tenantCodeService.assignIfMissing(platformCompany.getId());

        users.findByEmailIgnoreCase(superAdminEmail).ifPresentOrElse(existing -> {
            boolean dirty = false;
            if (existing.getCompany() == null || !existing.getCompany().getId().equals(platformCompanyRef.getId())) {
                existing.setCompany(platformCompanyRef);
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
            u.setCompany(platformCompanyRef);
            u.setFirstName("Platform");
            u.setLastName("Admin");
            u.setEmail(superAdminEmail);
            u.setPasswordHash(encoder.encode(superAdminPassword));
            u.setRole(Role.SUPER_ADMIN);
            u.setActive(true);
            u.setConsultant(false);
            users.save(u);
        });

        seedSetting(platformCompanyRef, SettingKey.GLOBAL_FISCAL_TEST_INVOICE_URL, "https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices");
        seedSetting(platformCompanyRef, SettingKey.GLOBAL_FISCAL_TEST_PREMISE_URL, "https://blagajne-test.fu.gov.si:9002/v1/cash_registers/invoices/register");
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

        final Company companyRef = tenantCodeService.assignIfMissing(company.getId());
        var companyName = companyRef.getName() != null && !companyRef.getName().isBlank() ? companyRef.getName() : tenantName;

        users.findByEmailIgnoreCase(adminEmail).ifPresentOrElse(existing -> {
            boolean dirty = false;

            if (existing.getCompany() == null || !existing.getCompany().getId().equals(companyRef.getId())) {
                existing.setCompany(companyRef);
                dirty = true;
            }

            if (existing.getRole() != Role.ADMIN) {
                existing.setRole(Role.ADMIN);
                dirty = true;
            }

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
            u.setCompany(companyRef);
            u.setFirstName("System");
            u.setLastName("Admin");
            u.setEmail(adminEmail);
            u.setPasswordHash(encoder.encode("Admin123!"));
            u.setRole(Role.ADMIN);
            u.setActive(true);
            u.setConsultant(true);
            users.save(u);
        });

        seedSetting(companyRef, SettingKey.SPACES_ENABLED, "true");
        seedSetting(companyRef, SettingKey.TYPES_ENABLED, "true");
        seedSetting(companyRef, SettingKey.BOOKABLE_ENABLED, "true");
        seedSetting(companyRef, SettingKey.AI_BOOKING_ENABLED, "true");
        seedSetting(companyRef, SettingKey.SESSION_LENGTH_MINUTES, "60");
        seedSetting(companyRef, SettingKey.WORKING_HOURS_START, "05:00");
        seedSetting(companyRef, SettingKey.WORKING_HOURS_END, "23:00");
        seedSetting(companyRef, SettingKey.PERSONAL_TASK_PRESETS_JSON, "[]");
        seedSetting(companyRef, SettingKey.INVOICE_COUNTER, "1");
        seedSetting(companyRef, SettingKey.COMPANY_NAME, companyName);
        seedSetting(companyRef, SettingKey.COMPANY_ADDRESS, "Street 1");
        seedSetting(companyRef, SettingKey.COMPANY_POSTAL_CODE, "1000");
        seedSetting(companyRef, SettingKey.COMPANY_CITY, "Ljubljana");
        seedSetting(companyRef, SettingKey.COMPANY_VAT_ID, "SI00000000");
        seedSetting(companyRef, SettingKey.COMPANY_IBAN, "SI56000000000000000");
        seedSetting(companyRef, SettingKey.COMPANY_EMAIL, "");
        seedSetting(companyRef, SettingKey.COMPANY_TELEPHONE, "");
        seedSetting(companyRef, SettingKey.PAYMENT_DEADLINE_DAYS, "15");
        seedSetting(companyRef, SettingKey.SIGNUP_PACKAGE_NAME, "PROFESSIONAL");
        seedSetting(companyRef, SettingKey.SIGNUP_USER_COUNT, "10");
        seedSetting(companyRef, SettingKey.SIGNUP_SMS_COUNT, "500");
        seedSetting(companyRef, SettingKey.TENANCY_SPACE_QUOTA, "10");
        seedSetting(companyRef, SettingKey.TENANCY_SMS_SENT_COUNT, "0");
        LocalDate subStart = LocalDate.now();
        seedSetting(companyRef, SettingKey.BILLING_SUBSCRIPTION_START, subStart.toString());
        seedSetting(companyRef, SettingKey.BILLING_SUBSCRIPTION_END, subStart.plusMonths(1).toString());
        seedSetting(companyRef, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, "MONTHLY");
        seedSetting(companyRef, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, "0.00");

        var methods = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyRef.getId());
        if (methods.isEmpty()) {
            var cash = new PaymentMethod();
            cash.setCompany(companyRef);
            cash.setName("Cash");
            cash.setPaymentType(PaymentType.CASH);
            cash.setFiscalized(true);
            cash.setStripeEnabled(false);
            paymentMethods.save(cash);
        }

        var txList = txServices.findAllByCompanyId(companyRef.getId());
        var tx = txList.stream().filter(s -> s.getCode().equalsIgnoreCase("CONSULT-001")).findFirst().orElse(null);
        if (tx == null) {
            var s = new TransactionService();
            s.setCompany(companyRef);
            s.setCode("CONSULT-001");
            s.setDescription("Consultation");
            s.setTaxRate(TaxRate.VAT_22);
            s.setNetPrice(new java.math.BigDecimal("50.00"));
            tx = txServices.save(s);
        }

        var therapyTypeOpt = types.findAllWithLinkedServicesByCompanyId(companyRef.getId()).stream()
                .filter(t -> t.getName().equalsIgnoreCase("THERAPY"))
                .findFirst();
        if (therapyTypeOpt.isEmpty()) {
            var type = new SessionType();
            type.setCompany(companyRef);
            type.setName("THERAPY");
            type.setDescription("Default therapy type");
            type.setDurationMinutes(60);

            var link = new TypeTransactionService();
            link.setSessionType(type);
            link.setTransactionService(tx);
            link.setPrice(null);
            type.getLinkedServices().add(link);
            types.save(type);
        } else {
            var therapyType = therapyTypeOpt.get();
            var txId = tx.getId();
            boolean hasLink = therapyType.getLinkedServices() != null &&
                    therapyType.getLinkedServices().stream().anyMatch(l -> l.getTransactionService() != null &&
                            l.getTransactionService().getId().equals(txId));
            if (!hasLink) {
                var link = new TypeTransactionService();
                link.setSessionType(therapyType);
                link.setTransactionService(tx);
                link.setPrice(null);
                therapyType.getLinkedServices().add(link);
                types.save(therapyType);
            }
        }
    }

    private void seedSetting(Company company, SettingKey key, String value) {
        settings.findByCompanyIdAndKey(company.getId(), key).ifPresentOrElse(existing -> {
            existing.setValue(value);
            settings.save(existing);
        }, () -> {
            var s = new AppSetting();
            s.setCompany(company);
            s.setKey(key.name());
            s.setValue(value);
            settings.save(s);
        });
    }
}
