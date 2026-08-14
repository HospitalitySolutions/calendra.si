package com.example.app.config;

import com.example.app.auth.LoginAccount;
import com.example.app.auth.LoginAccountRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.company.CompanyRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.workspacesubscription.WorkspaceSubscription;
import com.example.app.workspacesubscription.WorkspaceSubscriptionRepository;
import com.example.app.workspacesubscription.WorkspaceSubscriptionStatus;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates one predictable staff account for local development.
 *
 * <p>The component is deliberately restricted to the {@code local} Spring profile, so the
 * credentials below can never bootstrap an account in staging or production. The operation is
 * idempotent: on every local start it repairs the configured test account/company instead of
 * inserting duplicates.</p>
 */
@Profile("local")
@Component
@ConditionalOnProperty(prefix = "app.local-test-user", name = "enabled", havingValue = "true", matchIfMissing = true)
public class LocalTestUserBootstrap implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(LocalTestUserBootstrap.class);

    /**
     * Every switch exposed under App nastavitve -> Moduli for a tenant.
     * Local development deliberately enables all of them so the bootstrap account can exercise
     * the complete application without repeatedly configuring a fresh database.
     */
    private static final List<SettingKey> LOCAL_ENABLED_MODULES = List.of(
            SettingKey.LOCATIONS_ENABLED,
            SettingKey.SPACES_ENABLED,
            SettingKey.TYPES_ENABLED,
            SettingKey.SERVICE_GROUPS_ENABLED,
            SettingKey.ENTITLEMENTS_ENABLED,
            SettingKey.COURSES_ENABLED,
            SettingKey.CONSUMABLES_ENABLED,
            SettingKey.BOOKABLE_ENABLED,
            SettingKey.NO_SHOW_ENABLED,
            SettingKey.WAITLIST_ENABLED,
            SettingKey.CUSTOM_FIELDS_ENABLED,
            SettingKey.ONLINE_SESSION_BOOKING_ENABLED,
            SettingKey.WEBSITE_WIDGET_ENABLED,
            SettingKey.AI_BOOKING_ENABLED,
            SettingKey.PERSONAL_ENABLED,
            SettingKey.TODOS_ENABLED,
            SettingKey.MULTIPLE_SESSIONS_PER_SPACE_ENABLED,
            SettingKey.MULTIPLE_CLIENTS_PER_SESSION_ENABLED,
            SettingKey.GROUP_BOOKING_ENABLED,
            SettingKey.BILLING_ENABLED,
            SettingKey.MULTIPLE_COMPANIES_ENABLED,
            SettingKey.BILLING_INVOICES_ENABLED,
            SettingKey.BILLING_ONLINE_CARD_PAYMENTS_ENABLED,
            SettingKey.BILLING_BANK_TRANSFER_ENABLED,
            SettingKey.BILLING_PAYPAL_ENABLED,
            SettingKey.BILLING_GIFT_CARDS_ENABLED,
            SettingKey.BILLING_FISCAL_CASH_REGISTER_ENABLED,
            SettingKey.BILLING_ADVANCE_ENABLED,
            SettingKey.COMMUNICATION_ENABLED,
            SettingKey.NOTIFICATIONS_ENABLED,
            SettingKey.NOTIFICATIONS_EMAIL_ALERTS_ENABLED,
            SettingKey.CUSTOM_EMAIL_SENDER_ENABLED,
            SettingKey.NOTIFICATIONS_SMS_ALERTS_ENABLED,
            SettingKey.NOTIFICATIONS_GUEST_APP_ALERTS_ENABLED,
            SettingKey.NOTIFICATIONS_REMINDER_TEMPLATES_ENABLED,
            SettingKey.GOOGLE_CALENDAR_MODULE_ENABLED,
            SettingKey.SCANNER_MODULE_ENABLED,
            SettingKey.INBOX_ENABLED,
            SettingKey.WHATSAPP_MODULE_ENABLED,
            SettingKey.VIBER_MODULE_ENABLED,
            SettingKey.SECURITY_MODULE_ENABLED,
            SettingKey.SECURITY_SESSION_SECURITY_ENABLED,
            SettingKey.SECURITY_PASSKEYS_ENABLED,
            SettingKey.SECURITY_API_INTEGRATIONS_ENABLED
    );

    private static final String LOCAL_GUEST_APP_SETTINGS =
            "{\"tenantType\":\"salon\","
                    + "\"guestAppEnabled\":true,"
                    + "\"walletEnabled\":true,"
                    + "\"ordersEnabled\":true,"
                    + "\"buyTabEnabled\":true,"
                    + "\"entitlementsEnabled\":true,"
                    + "\"inboxEnabled\":true,"
                    + "\"multipleServicesEnabled\":true}";

    private final UserRepository users;
    private final LoginAccountRepository loginAccounts;
    private final CompanyRepository companies;
    private final CompanyProvisioningService companyProvisioningService;
    private final AppSettingRepository settings;
    private final WorkspaceSubscriptionRepository workspaceSubscriptions;
    private final PasswordEncoder passwordEncoder;

    @Value("${app.local-test-user.email:local@calendra.si}")
    private String email;

    @Value("${app.local-test-user.password:Admin123!}")
    private String password;

    @Value("${app.local-test-user.first-name:Local}")
    private String firstName;

    @Value("${app.local-test-user.last-name:Admin}")
    private String lastName;

    @Value("${app.local-test-user.company-name:Calendra Local}")
    private String companyName;

    public LocalTestUserBootstrap(
            UserRepository users,
            LoginAccountRepository loginAccounts,
            CompanyRepository companies,
            CompanyProvisioningService companyProvisioningService,
            AppSettingRepository settings,
            WorkspaceSubscriptionRepository workspaceSubscriptions,
            PasswordEncoder passwordEncoder
    ) {
        this.users = users;
        this.loginAccounts = loginAccounts;
        this.companies = companies;
        this.companyProvisioningService = companyProvisioningService;
        this.settings = settings;
        this.workspaceSubscriptions = workspaceSubscriptions;
        this.passwordEncoder = passwordEncoder;
    }

    @Override
    @Transactional
    public void run(String... args) {
        String normalizedEmail = normalizeEmail(email);
        String normalizedCompanyName = required(companyName, "app.local-test-user.company-name");
        String rawPassword = required(password, "app.local-test-user.password");

        Company company = findExactCompany(normalizedCompanyName);
        if (company == null) {
            company = companyProvisioningService.createWithTenantCode(normalizedCompanyName);
        } else {
            company = companyProvisioningService.ensureTenantCode(company);
        }

        if (company.getWorkspace() == null || !company.getWorkspace().isActive()) {
            throw new IllegalStateException("Local test company must belong to an active workspace.");
        }

        User membership = users.findByEmailIgnoreCaseAndCompanyId(normalizedEmail, company.getId()).orElse(null);
        LoginAccount account = membership != null && membership.getLoginAccount() != null
                ? membership.getLoginAccount()
                : loginAccounts.findFirstByEmailIgnoreCaseOrderByIdAsc(normalizedEmail).orElse(null);

        String passwordHash;
        if (account == null) {
            account = new LoginAccount();
            passwordHash = passwordEncoder.encode(rawPassword);
        } else if (account.getPasswordHash() == null || !passwordEncoder.matches(rawPassword, account.getPasswordHash())) {
            passwordHash = passwordEncoder.encode(rawPassword);
        } else {
            passwordHash = account.getPasswordHash();
        }

        account.setFirstName(defaultString(firstName, "Local"));
        account.setLastName(defaultString(lastName, "Admin"));
        account.setEmail(normalizedEmail);
        account.setPasswordHash(passwordHash);
        account.setActive(true);
        account.setLastSelectedCompanyId(company.getId());
        account = loginAccounts.save(account);

        if (membership == null) {
            membership = new User();
        }
        membership.setLoginAccount(account);
        membership.setCompany(company);
        membership.setFirstName(account.getFirstName());
        membership.setLastName(account.getLastName());
        membership.setEmail(normalizedEmail);
        membership.setPasswordHash(passwordHash);
        membership.setRole(Role.ADMIN);
        membership.setActive(true);
        membership.setConsultant(true);
        membership.setAvailableAllLocations(true);
        users.save(membership);

        seedLocalDefaults(company, normalizedEmail);
        ensureLocalWorkspaceSubscription(company, normalizedEmail);
        companyProvisioningService.ensureDefaultPaymentMethods(company);
        companyProvisioningService.initializeDefaultLocation(
                company,
                normalizedCompanyName,
                null,
                null,
                null,
                null,
                null,
                normalizedEmail
        );

        log.info(
                "Local test user is ready. email={}, company={}, tenantCode={}",
                normalizedEmail,
                company.getName(),
                company.getTenantCode()
        );
    }

    private Company findExactCompany(String requestedName) {
        return companies.findAllByNameContainingIgnoreCase(requestedName).stream()
                .filter(company -> company.getName() != null && company.getName().equalsIgnoreCase(requestedName))
                .findFirst()
                .orElse(null);
    }

    private void ensureLocalWorkspaceSubscription(Company company, String normalizedEmail) {
        // Flyway provisions the workspace subscription infrastructure before this runner executes.
        // The local bootstrap still upgrades the generated/default subscription to a deterministic
        // Premium test subscription so every local module can be exercised after each restart.
        WorkspaceSubscription subscription = workspaceSubscriptions
                .findByWorkspaceId(company.getWorkspace().getId())
                .orElseGet(WorkspaceSubscription::new);

        subscription.setWorkspace(company.getWorkspace());
        subscription.setLegacyPrimaryCompany(company);
        subscription.setPlanKey("PREMIUM");
        subscription.setBillingInterval("MONTHLY");
        subscription.setStatus(WorkspaceSubscriptionStatus.ACTIVE);
        subscription.setCurrentPeriodStart(LocalDate.now());
        subscription.setCurrentPeriodEnd(LocalDate.now().plusYears(10));
        subscription.setTrialEndsAt(null);
        subscription.setGraceUntil(null);
        subscription.setBillingEmail(normalizedEmail);
        subscription.setFeaturesJson(
                "[\"CORE\",\"MULTI_UNIT\",\"WORKSPACE_ANALYTICS\",\"WORKSPACE_PUBLIC_BOOKING\",\"CONFIGURATION_COPY\",\"API_ACCESS\"]"
        );
        subscription.setAddonsJson("[]");

        // A zero limit means unlimited for Premium workspace-level capacities.
        subscription.setMaxOperatingUnits(0);
        subscription.setMaxLocations(0);
        subscription.setMaxActiveUsers(0);
        subscription.setMaxConsultants(0);
        subscription.setMaxClients(0);
        subscription.setMaxMonthlyBookings(0);
        subscription.setIncludedSmsParts(500);
        subscription.setIncludedEmailMessages(0);
        subscription.setStorageLimitMb(0);
        subscription.setMaxPublicBookingPages(0);
        subscription.setAnalyticsRetentionDays(3650);
        subscription.setAllowSmsOverage(true);
        subscription.setAllowEmailOverage(true);
        subscription.setAllowBookingOverage(true);
        subscription.setApiAccess(true);

        workspaceSubscriptions.save(subscription);
    }

    private void seedLocalDefaults(Company company, String normalizedEmail) {
        // This account is specifically for broad local testing. Keep package/module access
        // deterministic even when the developer reuses an existing local database.
        upsertSetting(company, SettingKey.SIGNUP_PACKAGE_NAME, "PREMIUM");
        for (SettingKey moduleKey : LOCAL_ENABLED_MODULES) {
            upsertSetting(company, moduleKey, "true");
        }
        upsertSetting(company, SettingKey.GUEST_APP_SETTINGS_JSON, LOCAL_GUEST_APP_SETTINGS);

        seedSetting(company, SettingKey.MODULE_CONFIG_TYPE, "hair_salon");
        seedSetting(company, SettingKey.SESSION_LENGTH_MINUTES, "60");
        seedSetting(company, SettingKey.WORKING_HOURS_START, "05:00");
        seedSetting(company, SettingKey.WORKING_HOURS_END, "23:00");
        seedSetting(company, SettingKey.PERSONAL_TASK_PRESETS_JSON, "[]");
        seedSetting(company, SettingKey.INVOICE_COUNTER, "1");
        seedSetting(company, SettingKey.ORDER_COUNTER, "1");
        seedSetting(company, SettingKey.COMPANY_NAME, company.getName());
        seedSetting(company, SettingKey.COMPANY_EMAIL, normalizedEmail);
        seedSetting(company, SettingKey.PAYMENT_DEADLINE_DAYS, "15");
        seedSetting(company, SettingKey.SIGNUP_USER_COUNT, "10");
        seedSetting(company, SettingKey.SIGNUP_SMS_COUNT, "500");
        seedSetting(company, SettingKey.TENANCY_SPACE_QUOTA, "10");
        seedSetting(company, SettingKey.TENANCY_SMS_SENT_COUNT, "0");

        // Access/billing state is also repaired on startup so a previous local test cannot
        // accidentally lock this developer account out.
        upsertSetting(company, SettingKey.TENANCY_ACCESS_STATUS, "ACTIVE");
        upsertSetting(company, SettingKey.BILLING_SUBSCRIPTION_STATUS, "PAID");
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_START, LocalDate.now().toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_END, LocalDate.now().plusMonths(1).toString());
        seedSetting(company, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, "MONTHLY");
        upsertSetting(company, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, "0.00");
    }

    private void seedSetting(Company company, SettingKey key, String value) {
        if (settings.findByCompanyIdAndKey(company.getId(), key).isPresent()) {
            return;
        }
        AppSetting setting = new AppSetting();
        setting.setCompany(company);
        setting.setKey(key.name());
        setting.setValue(value);
        settings.save(setting);
    }

    private void upsertSetting(Company company, SettingKey key, String value) {
        AppSetting setting = settings.findByCompanyIdAndKey(company.getId(), key).orElseGet(() -> {
            AppSetting created = new AppSetting();
            created.setCompany(company);
            created.setKey(key.name());
            return created;
        });
        if (!value.equals(setting.getValue())) {
            setting.setValue(value);
            settings.save(setting);
        }
    }

    private static String normalizeEmail(String value) {
        String normalized = required(value, "app.local-test-user.email").trim().toLowerCase(Locale.ROOT);
        if (!normalized.contains("@")) {
            throw new IllegalStateException("app.local-test-user.email must be a valid email-like value.");
        }
        return normalized;
    }

    private static String required(String value, String propertyName) {
        if (value == null || value.isBlank()) {
            throw new IllegalStateException(propertyName + " must not be blank when local test-user bootstrap is enabled.");
        }
        return value.trim();
    }

    private static String defaultString(String value, String fallback) {
        return value == null || value.isBlank() ? fallback : value.trim();
    }
}
