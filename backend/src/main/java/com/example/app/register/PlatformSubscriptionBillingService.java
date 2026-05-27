package com.example.app.register;

import com.example.app.billing.OpenBill;
import com.example.app.billing.OpenBillItem;
import com.example.app.billing.OpenBillRepository;
import com.example.app.billing.PaymentMethod;
import com.example.app.billing.PaymentMethodRepository;
import com.example.app.billing.PaymentType;
import com.example.app.billing.TaxRate;
import com.example.app.billing.TransactionService;
import com.example.app.billing.TransactionServiceRepository;
import com.example.app.client.Client;
import com.example.app.client.ClientRepository;
import com.example.app.client.InvoiceRecipientType;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.company.CompanyRepository;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates and keeps the platform-admin open bill for self-serve register subscriptions.
 *
 * <p>The tenant is the newly registered company. The seller is the main Platform Admin tenant,
 * where the tenant is represented as a company payee ({@link ClientCompany}) and linked client.
 * The open-bill line is accrued daily by updating the quantity on a daily-priced line.</p>
 */
@Service
public class PlatformSubscriptionBillingService {
    private static final Logger log = LoggerFactory.getLogger(PlatformSubscriptionBillingService.class);

    private static final String PLATFORM_ADMIN_COMPANY_NAME = "Platform Admin";
    private static final String OPEN_BILL_REFERENCE_PREFIX = "CALENDRA-SUBSCRIPTION:";
    private static final int BASIC_MONTHLY_TRIAL_DAYS = 14;

    private final CompanyRepository companies;
    private final UserRepository users;
    private final ClientCompanyRepository clientCompanies;
    private final ClientRepository clients;
    private final TransactionServiceRepository txServices;
    private final OpenBillRepository openBills;
    private final PaymentMethodRepository paymentMethods;
    private final CompanyProvisioningService companyProvisioningService;
    private final AppSettingRepository settings;
    private final RegisterCatalogService registerCatalogService;

    public PlatformSubscriptionBillingService(
            CompanyRepository companies,
            UserRepository users,
            ClientCompanyRepository clientCompanies,
            ClientRepository clients,
            TransactionServiceRepository txServices,
            OpenBillRepository openBills,
            PaymentMethodRepository paymentMethods,
            CompanyProvisioningService companyProvisioningService,
            AppSettingRepository settings,
            RegisterCatalogService registerCatalogService
    ) {
        this.companies = companies;
        this.users = users;
        this.clientCompanies = clientCompanies;
        this.clients = clients;
        this.txServices = txServices;
        this.openBills = openBills;
        this.paymentMethods = paymentMethods;
        this.companyProvisioningService = companyProvisioningService;
        this.settings = settings;
        this.registerCatalogService = registerCatalogService;
    }

    /** Upserts the platform payee + open bill using the best data currently available for the signup. */
    @Transactional(noRollbackFor = Exception.class)
    public void ensureForSignupTenant(
            Company tenantCompany,
            User owner,
            String billingCompanyName,
            String vatId,
            String address,
            String postalCode,
            String city,
            String packageName,
            String billingInterval,
            String requestedPaymentMethod
    ) {
        if (tenantCompany == null || tenantCompany.getId() == null) {
            return;
        }
        Company platformCompany = resolvePlatformCompany().orElse(null);
        if (platformCompany == null || platformCompany.getId() == null) {
            log.warn("Skipping platform subscription open bill for tenant {}: Platform Admin tenant was not found.", tenantCompany.getId());
            return;
        }

        companyProvisioningService.ensureDefaultPaymentMethods(platformCompany);
        Map<String, PlatformPlan> plans = ensurePlatformTransactionServices(platformCompany);
        PlatformPlan plan = resolvePlan(plans, packageName, billingInterval);
        if (plan == null) {
            log.warn("Skipping platform subscription open bill for tenant {}: unsupported package={} interval={}", tenantCompany.getId(), packageName, billingInterval);
            return;
        }

        String email = owner == null ? null : trimToNull(owner.getEmail());
        String phone = owner == null ? null : trimToNull(owner.getPhone());
        String firstName = owner == null ? null : trimToNull(owner.getFirstName());
        String lastName = owner == null ? null : trimToNull(owner.getLastName());
        String resolvedCompanyName = firstNonBlank(billingCompanyName, tenantCompany.getName(), fullName(firstName, lastName), email, "New Calendra tenant");

        ClientCompany payee = upsertPlatformPayeeCompany(platformCompany, resolvedCompanyName, vatId, address, postalCode, city, email, phone);
        Client client = upsertPlatformPayeeClient(platformCompany, payee, firstName, lastName, email, phone, address, postalCode, city, vatId);
        User consultant = resolvePlatformConsultant(platformCompany).orElse(null);
        if (consultant == null) {
            log.warn("Skipping platform subscription open bill for tenant {}: no platform consultant/user was found.", tenantCompany.getId());
            return;
        }

        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        LocalDate billingStart = resolveInitialBillingStart(plan, tenantCompany.getId(), today);
        LocalDate billingEnd = periodEnd(billingStart, plan.interval());
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_START, billingStart.toString());
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_END, billingEnd.toString());
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, plan.interval().settingValue());

        OpenBill open = openBills.findFirstByCompanyIdAndReferenceOrderByIdAsc(platformCompany.getId(), referenceForTenant(tenantCompany.getId()))
                .orElseGet(() -> {
                    OpenBill created = new OpenBill();
                    created.setCompany(platformCompany);
                    created.setReference(referenceForTenant(tenantCompany.getId()));
                    return created;
                });
        open.setClient(client);
        open.setConsultant(consultant);
        open.setPaymentMethod(resolvePaymentMethod(platformCompany.getId(), requestedPaymentMethod).orElse(null));
        open.setBatchScope(OpenBill.BATCH_SCOPE_COMPANY);
        open.setBatchTargetClientId(null);
        open.setBatchTargetCompanyId(payee.getId());
        open.setSessionBooking(null);
        open.setBookingGroupKey(null);
        open.setBillType(null);
        applyPlanLine(open, plan, billingStart, today);
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, accruedGross(plan, billingStart, today).toPlainString());

        openBills.save(open);
    }

    /**
     * Daily accrual pass: open bills stay open and their single subscription line quantity grows
     * from the billable start date until the end of the current billing period.
     */
    @Scheduled(cron = "${app.platform-subscription-billing.daily-cron:0 10 0 * * *}")
    @Transactional
    public void refreshOpenSubscriptionBills() {
        Company platformCompany = resolvePlatformCompany().orElse(null);
        if (platformCompany == null || platformCompany.getId() == null) {
            return;
        }
        Map<String, PlatformPlan> plans = ensurePlatformTransactionServices(platformCompany);
        LocalDate today = LocalDate.now(ZoneId.systemDefault());
        for (OpenBill open : openBills.findAllByCompanyIdAndReferenceStartingWith(platformCompany.getId(), OPEN_BILL_REFERENCE_PREFIX)) {
            Long tenantId = parseTenantId(open.getReference());
            if (tenantId == null) {
                continue;
            }
            Company tenant = companies.findById(tenantId).orElse(null);
            if (tenant == null) {
                continue;
            }
            String packageName = settings.findByCompanyIdAndKey(tenantId, SettingKey.SIGNUP_PACKAGE_NAME)
                    .map(AppSetting::getValue)
                    .orElse("PROFESSIONAL");
            String interval = settings.findByCompanyIdAndKey(tenantId, SettingKey.BILLING_SUBSCRIPTION_INTERVAL)
                    .map(AppSetting::getValue)
                    .orElse("MONTHLY");
            PlatformPlan plan = resolvePlan(plans, packageName, interval);
            if (plan == null) {
                continue;
            }
            LocalDate billingStart = settings.findByCompanyIdAndKey(tenantId, SettingKey.BILLING_SUBSCRIPTION_START)
                    .map(AppSetting::getValue)
                    .map(this::parseDateOrNull)
                    .orElseGet(() -> resolveInitialBillingStart(plan, tenantId, today));
            applyPlanLine(open, plan, billingStart, today);
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, accruedGross(plan, billingStart, today).toPlainString());
            openBills.save(open);
        }
    }

    private Map<String, PlatformPlan> ensurePlatformTransactionServices(Company platformCompany) {
        Map<String, PlatformPlan> plans = platformPlansFromCatalog();
        for (PlatformPlan plan : plans.values()) {
            TransactionService tx = txServices.findByCompanyIdAndCodeIgnoreCase(platformCompany.getId(), plan.code())
                    .orElseGet(() -> {
                        TransactionService created = new TransactionService();
                        created.setCompany(platformCompany);
                        created.setCode(plan.code());
                        return created;
                    });
            boolean dirty = false;
            if (!Objects.equals(tx.getDescription(), plan.description())) {
                tx.setDescription(plan.description());
                dirty = true;
            }
            if (tx.getTaxRate() != TaxRate.NO_VAT) {
                tx.setTaxRate(TaxRate.NO_VAT);
                dirty = true;
            }
            if (tx.getNetPrice() == null || tx.getNetPrice().compareTo(plan.grossMonthlyEquivalent()) != 0) {
                tx.setNetPrice(plan.grossMonthlyEquivalent());
                dirty = true;
            }
            if (!tx.isActive()) {
                tx.setActive(true);
                dirty = true;
            }
            if (tx.getId() == null || dirty) {
                txServices.save(tx);
            }
            plan.setTransactionService(tx);
        }
        return plans;
    }

    private Map<String, PlatformPlan> platformPlansFromCatalog() {
        RegisterPriceCatalog catalog = registerCatalogService.mergedCatalog();
        Map<String, Double> catalogPlans = catalog == null || catalog.getPlans() == null ? Map.of() : catalog.getPlans();
        BigDecimal basic = money(catalogPlans.getOrDefault("basic", 18.90));
        BigDecimal pro = money(catalogPlans.getOrDefault("pro", 34.90));
        BigDecimal business = money(catalogPlans.getOrDefault("business", 59.90));
        BigDecimal annualDiscountPercent = percent(catalog == null ? null : catalog.getAnnualDiscountPercent());

        Map<String, PlatformPlan> out = new LinkedHashMap<>();
        out.put("BASIC:MONTHLY", new PlatformPlan("BASICMONTHLY", "Basic Package - Monthly", basic, BillingInterval.MONTHLY));
        out.put("BASIC:YEARLY", new PlatformPlan("BASICANNUAL", "Basic Package - Annual", annualMonthlyEquivalent(basic, annualDiscountPercent), BillingInterval.YEARLY));
        out.put("PROFESSIONAL:MONTHLY", new PlatformPlan("PROMONTHLY", "Pro Package - Monthly", pro, BillingInterval.MONTHLY));
        out.put("PROFESSIONAL:YEARLY", new PlatformPlan("PROANNUAL", "Pro Package - Annual", annualMonthlyEquivalent(pro, annualDiscountPercent), BillingInterval.YEARLY));
        out.put("PREMIUM:MONTHLY", new PlatformPlan("BUSINESSMONTHLY", "Business Package - Monthly", business, BillingInterval.MONTHLY));
        out.put("PREMIUM:YEARLY", new PlatformPlan("BUSINESSANNUAL", "Business Package - Annual", annualMonthlyEquivalent(business, annualDiscountPercent), BillingInterval.YEARLY));
        return out;
    }

    private PlatformPlan resolvePlan(Map<String, PlatformPlan> plans, String packageName, String billingInterval) {
        String normalizedPackage = normalizePackageType(packageName);
        String normalizedInterval = normalizeInterval(billingInterval).settingValue();
        if ("TRIAL".equals(normalizedPackage)) {
            normalizedPackage = "BASIC";
            normalizedInterval = "MONTHLY";
        }
        return plans.get(normalizedPackage + ":" + normalizedInterval);
    }

    private void applyPlanLine(OpenBill open, PlatformPlan plan, LocalDate billingStart, LocalDate today) {
        if (open.getItems() != null) {
            open.getItems().clear();
        }
        BigDecimal dailyNet = dailyGrossAmount(plan, billingStart);
        int accruedDays = accruedDays(billingStart, periodEnd(billingStart, plan.interval()), today);
        OpenBillItem item = new OpenBillItem();
        item.setOpenBill(open);
        item.setTransactionService(plan.transactionService());
        item.setQuantity(accruedDays);
        item.setNetPrice(dailyNet);
        item.setSourceSessionBookingId(null);
        item.setSourceAdvanceBillId(null);
        open.getItems().add(item);
    }

    private BigDecimal accruedGross(PlatformPlan plan, LocalDate billingStart, LocalDate today) {
        BigDecimal daily = dailyGrossAmount(plan, billingStart);
        int quantity = accruedDays(billingStart, periodEnd(billingStart, plan.interval()), today);
        return daily.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal dailyGrossAmount(PlatformPlan plan, LocalDate billingStart) {
        LocalDate end = periodEnd(billingStart, plan.interval());
        long days = Math.max(1L, ChronoUnit.DAYS.between(billingStart, end));
        BigDecimal periodGross = plan.grossMonthlyEquivalent();
        if (plan.interval() == BillingInterval.YEARLY) {
            periodGross = periodGross.multiply(BigDecimal.valueOf(12));
        }
        return periodGross.divide(BigDecimal.valueOf(days), 2, RoundingMode.HALF_UP);
    }

    private int accruedDays(LocalDate billingStart, LocalDate billingEnd, LocalDate today) {
        if (today.isBefore(billingStart)) {
            return 0;
        }
        LocalDate chargeThroughExclusive = today.plusDays(1).isAfter(billingEnd) ? billingEnd : today.plusDays(1);
        long days = ChronoUnit.DAYS.between(billingStart, chargeThroughExclusive);
        return Math.max(0, Math.toIntExact(days));
    }

    private LocalDate resolveInitialBillingStart(PlatformPlan plan, Long tenantId, LocalDate today) {
        if (plan.interval() == BillingInterval.MONTHLY && "BASICMONTHLY".equals(plan.code())) {
            LocalDate storedStart = settings.findByCompanyIdAndKey(tenantId, SettingKey.BILLING_SUBSCRIPTION_START)
                    .map(AppSetting::getValue)
                    .map(this::parseDateOrNull)
                    .orElse(null);
            if (storedStart != null && storedStart.isAfter(today)) {
                return storedStart;
            }
            return today.plusDays(BASIC_MONTHLY_TRIAL_DAYS);
        }
        return today;
    }

    private LocalDate periodEnd(LocalDate start, BillingInterval interval) {
        return interval == BillingInterval.YEARLY ? start.plusYears(1) : start.plusMonths(1);
    }

    private ClientCompany upsertPlatformPayeeCompany(
            Company platformCompany,
            String name,
            String vatId,
            String address,
            String postalCode,
            String city,
            String email,
            String phone
    ) {
        String normalizedVat = ClientCompany.normalizeVatIdStorage(vatId);
        ClientCompany row = null;
        if (normalizedVat != null) {
            row = clientCompanies.findFirstByOwnerCompanyIdAndVatId(platformCompany.getId(), normalizedVat).orElse(null);
        }
        if (row == null && email != null && !email.isBlank()) {
            row = clientCompanies.findFirstByOwnerCompanyIdAndEmailIgnoreCase(platformCompany.getId(), email.trim()).orElse(null);
        }
        if (row == null && name != null && !name.isBlank()) {
            row = clientCompanies.findFirstByOwnerCompanyIdAndNameIgnoreCase(platformCompany.getId(), name.trim()).orElse(null);
        }
        if (row == null) {
            row = new ClientCompany();
            row.setOwnerCompany(platformCompany);
        }
        row.setName(firstNonBlank(name, row.getName(), "New Calendra tenant"));
        row.setVatId(normalizedVat);
        row.setAddress(stringOrEmpty(address));
        row.setPostalCode(stringOrEmpty(postalCode));
        row.setCity(stringOrEmpty(city));
        row.setEmail(trimToNull(email));
        row.setTelephone(trimToNull(phone));
        row.setActive(true);
        row.setBatchPaymentEnabled(true);
        return clientCompanies.save(row);
    }

    private Client upsertPlatformPayeeClient(
            Company platformCompany,
            ClientCompany payee,
            String firstName,
            String lastName,
            String email,
            String phone,
            String address,
            String postalCode,
            String city,
            String vatId
    ) {
        Client client = clients.findFirstByCompanyIdAndBillingCompanyIdOrderByIdAsc(platformCompany.getId(), payee.getId())
                .orElseGet(() -> {
                    String normalizedEmail = Client.normalizeEmailStorage(email);
                    if (normalizedEmail != null) {
                        List<Client> byEmail = clients.findAllByCompanyIdAndNormalizedEmail(platformCompany.getId(), normalizedEmail);
                        if (!byEmail.isEmpty()) {
                            return byEmail.get(0);
                        }
                    }
                    Client created = new Client();
                    created.setCompany(platformCompany);
                    return created;
                });
        client.setFirstName(firstNonBlank(firstName, payee.getName(), "Calendra"));
        client.setLastName(firstNonBlank(lastName, "Tenant"));
        client.setEmail(trimToNull(email));
        client.setPhone(trimToNull(phone));
        client.setBillingCompany(payee);
        client.setInvoiceRecipientType(InvoiceRecipientType.COMPANY);
        client.setInvoiceCompanyName(payee.getName());
        client.setInvoiceCompanyAddressLine(stringOrEmpty(address));
        client.setInvoiceCompanyPostalCode(stringOrEmpty(postalCode));
        client.setInvoiceCompanyCity(stringOrEmpty(city));
        client.setInvoiceCompanyVatId(ClientCompany.normalizeVatIdStorage(vatId));
        client.setBatchPaymentEnabled(true);
        client.setActive(true);
        return clients.save(client);
    }

    private Optional<Company> resolvePlatformCompany() {
        Optional<Company> named = companies.findAll().stream()
                .filter(c -> c.getName() != null && PLATFORM_ADMIN_COMPANY_NAME.equalsIgnoreCase(c.getName().trim()))
                .min(Comparator.comparing(Company::getId));
        if (named.isPresent()) {
            return named;
        }
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .map(User::getCompany)
                .filter(Objects::nonNull)
                .findFirst();
    }

    private Optional<User> resolvePlatformConsultant(Company platformCompany) {
        return users.findAllByRoleOrderByIdAsc(Role.SUPER_ADMIN).stream()
                .filter(User::isActive)
                .filter(u -> u.getCompany() != null && Objects.equals(u.getCompany().getId(), platformCompany.getId()))
                .findFirst()
                .or(() -> users.findAllByCompanyId(platformCompany.getId()).stream()
                        .filter(User::isActive)
                        .min(Comparator.comparing(User::getId)));
    }

    private Optional<PaymentMethod> resolvePaymentMethod(Long platformCompanyId, String requestedPaymentMethod) {
        List<PaymentMethod> all = paymentMethods.findAllByCompanyIdOrderByNameAsc(platformCompanyId);
        String normalized = requestedPaymentMethod == null ? "" : requestedPaymentMethod.trim().toUpperCase(Locale.ROOT);
        if ("CARD".equals(normalized) || "STRIPE".equals(normalized)) {
            return all.stream().filter(pm -> pm.getPaymentType() == PaymentType.CARD).findFirst()
                    .or(() -> all.stream().filter(pm -> pm.getName() != null && pm.getName().equalsIgnoreCase("Stripe")).findFirst());
        }
        if ("PAYPAL".equals(normalized)) {
            return all.stream().filter(pm -> pm.getName() != null && pm.getName().equalsIgnoreCase("PayPal")).findFirst()
                    .or(() -> all.stream().filter(pm -> pm.getPaymentType() == PaymentType.OTHER).findFirst());
        }
        if ("BANK_TRANSFER".equals(normalized) || "BANK".equals(normalized)) {
            return all.stream().filter(pm -> pm.getPaymentType() == PaymentType.BANK_TRANSFER).findFirst();
        }
        return all.stream().filter(pm -> pm.getPaymentType() == PaymentType.BANK_TRANSFER).findFirst()
                .or(() -> all.stream().findFirst());
    }

    private void upsertSetting(Company company, SettingKey key, String value) {
        settings.findByCompanyIdAndKey(company.getId(), key).ifPresentOrElse(existing -> {
            existing.setValue(value);
            settings.save(existing);
        }, () -> {
            AppSetting s = new AppSetting();
            s.setCompany(company);
            s.setKey(key.name());
            s.setValue(value);
            settings.save(s);
        });
    }

    private String referenceForTenant(Long tenantCompanyId) {
        return OPEN_BILL_REFERENCE_PREFIX + tenantCompanyId;
    }

    private Long parseTenantId(String reference) {
        if (reference == null || !reference.startsWith(OPEN_BILL_REFERENCE_PREFIX)) {
            return null;
        }
        try {
            return Long.parseLong(reference.substring(OPEN_BILL_REFERENCE_PREFIX.length()).trim());
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private LocalDate parseDateOrNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(value.trim());
        } catch (Exception e) {
            return null;
        }
    }

    private static BigDecimal money(Double value) {
        return BigDecimal.valueOf(value == null ? 0.0 : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal annualMonthlyEquivalent(BigDecimal monthly, BigDecimal annualDiscountPercent) {
        BigDecimal factor = BigDecimal.ONE.subtract(annualDiscountPercent.divide(new BigDecimal("100"), 6, RoundingMode.HALF_UP));
        return monthly.multiply(factor).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal percent(Double value) {
        if (value == null || value.isNaN() || value.isInfinite() || value < 0 || value > 100) {
            return new BigDecimal("15.00");
        }
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP);
    }

    private static String normalizePackageType(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            return "PROFESSIONAL";
        }
        String normalized = rawValue.trim().toUpperCase(Locale.ROOT).replace(' ', '_').replace('-', '_');
        if ("PRO".equals(normalized)) {
            return "PROFESSIONAL";
        }
        if ("BUSINESS".equals(normalized)) {
            return "PREMIUM";
        }
        if ("BASIC".equals(normalized) || "TRIAL".equals(normalized) || "PROFESSIONAL".equals(normalized) || "PREMIUM".equals(normalized)) {
            return normalized;
        }
        return "PROFESSIONAL";
    }

    private static BillingInterval normalizeInterval(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            return BillingInterval.MONTHLY;
        }
        String normalized = rawValue.trim().toUpperCase(Locale.ROOT).replace('-', '_');
        return "YEARLY".equals(normalized) || "ANNUAL".equals(normalized) ? BillingInterval.YEARLY : BillingInterval.MONTHLY;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            String trimmed = trimToNull(value);
            if (trimmed != null) {
                return trimmed;
            }
        }
        return null;
    }

    private static String fullName(String firstName, String lastName) {
        String full = ((firstName == null ? "" : firstName.trim()) + " " + (lastName == null ? "" : lastName.trim())).trim();
        return full.isBlank() ? null : full;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isBlank() ? null : trimmed;
    }

    private static String stringOrEmpty(String value) {
        return value == null ? "" : value.trim();
    }

    private enum BillingInterval {
        MONTHLY,
        YEARLY;

        private String settingValue() {
            return this == YEARLY ? "YEARLY" : "MONTHLY";
        }
    }

    private static final class PlatformPlan {
        private final String code;
        private final String description;
        private final BigDecimal grossMonthlyEquivalent;
        private final BillingInterval interval;
        private TransactionService transactionService;

        private PlatformPlan(String code, String description, BigDecimal grossMonthlyEquivalent, BillingInterval interval) {
            this.code = code;
            this.description = description;
            this.grossMonthlyEquivalent = grossMonthlyEquivalent;
            this.interval = interval;
        }

        private String code() {
            return code;
        }

        private String description() {
            return description;
        }

        private BigDecimal grossMonthlyEquivalent() {
            return grossMonthlyEquivalent;
        }

        private BillingInterval interval() {
            return interval;
        }

        private TransactionService transactionService() {
            return transactionService;
        }

        private void setTransactionService(TransactionService transactionService) {
            this.transactionService = transactionService;
        }
    }
}
