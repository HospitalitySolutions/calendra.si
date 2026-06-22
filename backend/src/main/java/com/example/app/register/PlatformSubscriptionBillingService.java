package com.example.app.register;

import com.example.app.billing.Bill;
import com.example.app.billing.BillFiscalStatus;
import com.example.app.billing.BillFolioPdfService;
import com.example.app.billing.BillItem;
import com.example.app.billing.BillPaymentStatus;
import com.example.app.billing.BillRepository;
import com.example.app.billing.BillType;
import com.example.app.billing.BillingEmailService;
import com.example.app.billing.InvoiceOrderIdService;
import com.example.app.billing.InvoicePdfS3Service;
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
import com.example.app.common.SimulatedTimeContext;
import com.example.app.common.TimeService;
import com.example.app.company.ClientCompany;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.company.CompanyProvisioningService;
import com.example.app.company.CompanyRepository;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.monitoring.ScheduledJobTrackerService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.stripe.StripeBillingService;
import com.example.app.stripe.StripeCheckoutSessionResult;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.zip.CRC32;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Creates and keeps the Platform Admin open bill for self-serve register subscriptions.
 *
 * <p>Each package interval, add-on, additional user and SMS charge can be mapped to a
 * transaction service in the Platform Admin tenant via the register catalog settings. If no
 * mapping is selected, the service creates/uses a backward-compatible fallback transaction service.</p>
 */
@Service
public class PlatformSubscriptionBillingService {
    private static final Logger log = LoggerFactory.getLogger(PlatformSubscriptionBillingService.class);

    private static final String PLATFORM_ADMIN_COMPANY_NAME = "Platform Admin";
    private static final String OPEN_BILL_REFERENCE_PREFIX = "CALENDRA-SUBSCRIPTION:";
    private static final int BASIC_MONTHLY_TRIAL_DAYS = 14;
    private static final int TRANSACTION_SERVICE_CODE_MAX_LENGTH = 12;

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
    private final BillRepository bills;
    private final InvoiceOrderIdService invoiceOrderIdService;
    private final FiscalizationService fiscalizationService;
    private final BillFolioPdfService billFolioPdfService;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final BillingEmailService billingEmailService;
    private final StripeBillingService stripeBillingService;
    private final TimeService timeService;
    private final ScheduledJobTrackerService jobTracker;
    private final ObjectMapper objectMapper;

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
            RegisterCatalogService registerCatalogService,
            BillRepository bills,
            InvoiceOrderIdService invoiceOrderIdService,
            FiscalizationService fiscalizationService,
            BillFolioPdfService billFolioPdfService,
            InvoicePdfS3Service invoicePdfS3Service,
            BillingEmailService billingEmailService,
            StripeBillingService stripeBillingService,
            TimeService timeService,
            ScheduledJobTrackerService jobTracker,
            ObjectMapper objectMapper
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
        this.bills = bills;
        this.invoiceOrderIdService = invoiceOrderIdService;
        this.fiscalizationService = fiscalizationService;
        this.billFolioPdfService = billFolioPdfService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.billingEmailService = billingEmailService;
        this.stripeBillingService = stripeBillingService;
        this.timeService = timeService;
        this.jobTracker = jobTracker;
        this.objectMapper = objectMapper;
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
            String requestedPaymentMethod,
            Integer userCount,
            Integer smsCount,
            List<String> addonKeys
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
        RegisterPriceCatalog catalog = registerCatalogService.mergedCatalog();
        PlatformBillingCatalog billingCatalog = ensurePlatformBillingCatalog(platformCompany, catalog);
        PlatformPlan plan = billingCatalog.resolvePlan(packageName, billingInterval);
        if (plan == null && "CUSTOM".equals(normalizePackageType(packageName))) {
            plan = customPlan(platformCompany, tenantCompany, billingInterval);
        }
        if (plan == null) {
            log.warn("Skipping platform subscription open bill for tenant {}: unsupported package={} interval={}", tenantCompany.getId(), packageName, billingInterval);
            return;
        }

        String email = owner == null ? null : trimToNull(owner.getEmail());
        String phone = owner == null ? null : trimToNull(owner.getPhone());
        String firstName = owner == null ? null : trimToNull(owner.getFirstName());
        String lastName = owner == null ? null : trimToNull(owner.getLastName());
        String resolvedCompanyName = firstNonBlank(billingCompanyName, tenantCompany.getName(), fullName(firstName, lastName), email, "New Calendra tenant");

        ClientCompany payee = upsertPlatformPayeeCompany(platformCompany, tenantCompany, resolvedCompanyName, vatId, address, postalCode, city, email, phone);
        Client client = upsertPlatformPayeeClient(platformCompany, payee, firstName, lastName, email, phone, address, postalCode, city, vatId);
        User consultant = resolvePlatformConsultant(platformCompany).orElse(null);
        if (consultant == null) {
            log.warn("Skipping platform subscription open bill for tenant {}: no platform consultant/user was found.", tenantCompany.getId());
            return;
        }

        LocalDate today = timeService.localDate(ZoneId.systemDefault(), tenantCompany.getId());
        LocalDate billingStart = resolveInitialBillingStart(plan, tenantCompany.getId(), today);
        LocalDate billingEnd = periodEnd(billingStart, plan.interval());
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_START, billingStart.toString());
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_END, billingEnd.toString());
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, plan.interval().settingValue());
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT, settingValueOrDefault(tenantCompany.getId(), SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT, "0"));
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT, settingValueOrDefault(tenantCompany.getId(), SettingKey.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT, "0"));
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS, settingValueOrDefault(tenantCompany.getId(), SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS, ""));
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_NEXT_USER_COUNT, String.valueOf(Math.max(1, userCount == null ? 1 : userCount)));
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_NEXT_SMS_COUNT, String.valueOf(Math.max(0, smsCount == null ? 0 : smsCount)));
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS, joinAddonKeys(addonKeys));

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
        open.setBillType(BillType.INVOICE);
        BigDecimal totalGross = applySubscriptionLines(open, billingCatalog, plan, tenantCompany.getId(), userCount, smsCount, addonKeys, 0, 0, List.of());
        upsertSetting(tenantCompany, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, totalGross.toPlainString());

        openBills.save(open);
    }

    /**
     * Converts the signup open bill into a bill and starts the configured payment flow. Card bills use
     * Stripe Checkout and are fiscalized/archived/emailed after the webhook marks them paid. Bank transfer
     * and non-Stripe methods archive/email the PDF immediately in the same way as the standard close-bill flow.
     */
    @Transactional(noRollbackFor = Exception.class)
    public SignupBillingInvoiceResult createInvoiceForSignupTenantIfDue(Company tenantCompany) {
        if (tenantCompany == null || tenantCompany.getId() == null) {
            return SignupBillingInvoiceResult.empty();
        }
        Company platformCompany = resolvePlatformCompany().orElse(null);
        if (platformCompany == null || platformCompany.getId() == null) {
            return SignupBillingInvoiceResult.empty();
        }
        String reference = referenceForTenant(tenantCompany.getId());
        OpenBill open = openBills.findFirstByCompanyIdAndReferenceOrderByIdAsc(platformCompany.getId(), reference).orElse(null);
        if (open == null || open.getItems() == null || open.getItems().isEmpty()) {
            return findExistingSignupBill(platformCompany.getId(), reference)
                    .map(existing -> new SignupBillingInvoiceResult(existing.getId(), existing.getBillNumber(), null, existing.getPaymentStatus()))
                    .orElseGet(SignupBillingInvoiceResult::empty);
        }
        BigDecimal openTotalGross = openBillTotalGross(open);
        if (openTotalGross.compareTo(BigDecimal.ZERO) <= 0) {
            return SignupBillingInvoiceResult.empty();
        }
        Optional<Bill> existing = findExistingSignupBill(platformCompany.getId(), reference);
        if (existing.isPresent()) {
            Bill bill = existing.get();
            return new SignupBillingInvoiceResult(bill.getId(), bill.getBillNumber(), null, bill.getPaymentStatus());
        }

        Bill saved = createBillFromSignupOpenBill(open, platformCompany);
        return startSubscriptionBillPayment(saved, platformCompany);
    }

    /**
     * Issues the configured payment flow for a freshly created platform subscription bill. Card bills go
     * through Stripe Checkout; other methods are fiscalized/archived/emailed immediately. Shared by the
     * initial signup invoice and the recurring renewal invoice.
     */
    private SignupBillingInvoiceResult startSubscriptionBillPayment(Bill saved, Company platformCompany) {
        PaymentMethod method = saved.getPaymentMethod();
        if (method != null && method.isStripeEnabled() && method.getPaymentType() == PaymentType.CARD) {
            StripeCheckoutSessionResult checkout = stripeBillingService.createCheckoutSessionForBill(saved);
            billingEmailService.sendCheckoutLink(saved, checkout.url());
            return new SignupBillingInvoiceResult(saved.getId(), saved.getBillNumber(), checkout.url(), BillPaymentStatus.PAYMENT_PENDING);
        }

        boolean paidImmediately = method != null
                && method.getPaymentType() != PaymentType.BANK_TRANSFER
                && method.getPaymentType() != PaymentType.OTHER;
        saved.setPaymentStatus(paidImmediately ? BillPaymentStatus.PAID : BillPaymentStatus.PAYMENT_PENDING);
        if (paidImmediately) {
            saved.setPaidAt(OffsetDateTime.now());
        }
        saved = bills.saveAndFlush(saved);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod())) {
            saved = fiscalizationService.fiscalizeBill(saved, platformCompany.getId());
        }
        byte[] pdf = generateAndArchive(saved, platformCompany.getId());
        if (method != null && method.getPaymentType() == PaymentType.BANK_TRANSFER) {
            billingEmailService.sendBankTransferFolio(saved, pdf);
        } else {
            billingEmailService.sendInvoiceFolio(saved, pdf);
        }
        return new SignupBillingInvoiceResult(saved.getId(), saved.getBillNumber(), null, saved.getPaymentStatus());
    }

    /**
     * Applies a self-serve package/interval change for a tenant.
     *
     * <p>Upgrades (to a higher tier or more expensive interval) take effect immediately for both
     * functionality (via {@code SIGNUP_PACKAGE_NAME}) and the active billing interval; the price
     * difference for the already-paid current cycle is deferred and charged on the next renewal
     * invoice. Downgrades keep the current package functionality and price until the end of the
     * current billing cycle and switch at the next renewal.</p>
     */
    @Transactional
    public PackageChangeResult applyPackageChange(Company tenant, String requestedPackage, String requestedInterval) {
        if (tenant == null || tenant.getId() == null) {
            return PackageChangeResult.none("PROFESSIONAL", BillingInterval.MONTHLY.settingValue());
        }
        Long tenantId = tenant.getId();
        RegisterPriceCatalog catalog = registerCatalogService.mergedCatalog();

        String currentPackage = normalizePackageType(settingValueOrDefault(tenantId, SettingKey.SIGNUP_PACKAGE_NAME, "PROFESSIONAL"));
        BillingInterval currentInterval = normalizeInterval(settingValueOrDefault(tenantId, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, "MONTHLY"));
        String targetPackage = normalizePackageType(requestedPackage);
        BillingInterval targetInterval = (requestedInterval == null || requestedInterval.isBlank())
                ? currentInterval
                : normalizeInterval(requestedInterval);

        BigDecimal existingDiff = parseAmountSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_UPGRADE_DIFF_AMOUNT);
        BigDecimal currentGross = periodGrossFor(catalog, currentPackage, currentInterval);
        BigDecimal targetGross = periodGrossFor(catalog, targetPackage, targetInterval);

        boolean sameSelection = currentPackage.equals(targetPackage) && currentInterval == targetInterval;
        if (sameSelection) {
            // Re-selecting the active package cancels any pending downgrade.
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_NEXT_PACKAGE_NAME, "");
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_NEXT_INTERVAL, "");
            return new PackageChangeResult(currentPackage, currentPackage, currentInterval.settingValue(), currentInterval.settingValue(), existingDiff, "NONE");
        }

        int currentRank = packageRank(currentPackage);
        int targetRank = packageRank(targetPackage);
        boolean upgrade = targetRank != currentRank
                ? targetRank > currentRank
                : targetGross.compareTo(currentGross) > 0;

        if (upgrade) {
            BigDecimal increment = targetGross.subtract(currentGross).max(BigDecimal.ZERO);
            BigDecimal newDiff = existingDiff.add(increment).setScale(2, RoundingMode.HALF_UP);
            upsertSetting(tenant, SettingKey.SIGNUP_PACKAGE_NAME, targetPackage);
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, targetInterval.settingValue());
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_UPGRADE_DIFF_AMOUNT, newDiff.toPlainString());
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_NEXT_PACKAGE_NAME, "");
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_NEXT_INTERVAL, "");
            return new PackageChangeResult(targetPackage, targetPackage, targetInterval.settingValue(), targetInterval.settingValue(), newDiff, "UPGRADE");
        }

        // Downgrade: defer both functionality and price until the next renewal.
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_NEXT_PACKAGE_NAME, targetPackage);
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_NEXT_INTERVAL, targetInterval.settingValue());
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_UPGRADE_DIFF_AMOUNT, "0");
        return new PackageChangeResult(currentPackage, targetPackage, currentInterval.settingValue(), targetInterval.settingValue(), BigDecimal.ZERO, "DOWNGRADE");
    }

    /**
     * Daily renewal: for every tenant whose current billing period has ended, promote any deferred
     * downgrade/interval change, advance the period, and issue the renewal invoice including the
     * one-off upgrade difference accumulated during the previous cycle.
     */
    @Scheduled(cron = "${app.platform-subscription-billing.renewal-cron:0 20 0 * * *}")
    @SchedulerLock(name = "platformSubscriptionBillingService_renewSubscriptionsDue", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Transactional
    public void renewSubscriptionsDue() {
        jobTracker.run("platform-subscription-renewals", () -> {
            Company platformCompany = resolvePlatformCompany().orElse(null);
            if (platformCompany == null || platformCompany.getId() == null) {
                return 0;
            }
            int renewed = 0;
            RegisterPriceCatalog catalog = registerCatalogService.mergedCatalog();
            PlatformBillingCatalog billingCatalog = ensurePlatformBillingCatalog(platformCompany, catalog);
            for (AppSetting endSetting : settings.findAllByKey(SettingKey.BILLING_SUBSCRIPTION_END)) {
                Company tenant = endSetting == null ? null : endSetting.getCompany();
                if (tenant == null || tenant.getId() == null || Objects.equals(tenant.getId(), platformCompany.getId())) {
                    continue;
                }
                // Evaluate each tenant against its own (possibly simulated) clock.
                LocalDate today = timeService.localDate(ZoneId.systemDefault(), tenant.getId());
                LocalDate end = parseDateOrNull(endSetting.getValue());
                if (end == null || end.isAfter(today)) {
                    continue;
                }
                try {
                    SimulatedTimeContext.runAs(tenant.getId(), () -> renewTenantSubscription(platformCompany, tenant, billingCatalog, end));
                    renewed++;
                } catch (Exception e) {
                    log.warn("Failed to renew platform subscription for tenant {}", tenant.getId(), e);
                }
            }
            return renewed;
        });
    }

    private void renewTenantSubscription(Company platformCompany, Company tenant, PlatformBillingCatalog billingCatalog, LocalDate previousEnd) {
        Long tenantId = tenant.getId();

        // Promote deferred downgrade / interval change so it applies for the new cycle.
        String pendingPackage = trimToNull(settingValueOrDefault(tenantId, SettingKey.BILLING_SUBSCRIPTION_NEXT_PACKAGE_NAME, ""));
        if (pendingPackage != null) {
            upsertSetting(tenant, SettingKey.SIGNUP_PACKAGE_NAME, normalizePackageType(pendingPackage));
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_NEXT_PACKAGE_NAME, "");
        }
        String pendingInterval = trimToNull(settingValueOrDefault(tenantId, SettingKey.BILLING_SUBSCRIPTION_NEXT_INTERVAL, ""));
        if (pendingInterval != null) {
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, normalizeInterval(pendingInterval).settingValue());
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_NEXT_INTERVAL, "");
        }

        String packageName = normalizePackageType(settingValueOrDefault(tenantId, SettingKey.SIGNUP_PACKAGE_NAME, "PROFESSIONAL"));
        String interval = normalizeInterval(settingValueOrDefault(tenantId, SettingKey.BILLING_SUBSCRIPTION_INTERVAL, "MONTHLY")).settingValue();
        PlatformPlan plan = billingCatalog.resolvePlan(packageName, interval);
        if (plan == null && "CUSTOM".equals(normalizePackageType(packageName))) {
            plan = customPlan(platformCompany, tenant, interval);
        }
        if (plan == null) {
            return;
        }

        ClientCompany payee = clientCompanies.findFirstLinkedPlatformPayee(platformCompany.getId(), tenantId).orElse(null);
        if (payee == null) {
            log.warn("Skipping renewal for tenant {}: no platform payee company found.", tenantId);
            return;
        }
        Client client = clients.findFirstByCompanyIdAndBillingCompanyIdOrderByIdAsc(platformCompany.getId(), payee.getId()).orElse(null);
        User consultant = resolvePlatformConsultant(platformCompany).orElse(null);
        if (client == null || consultant == null) {
            log.warn("Skipping renewal for tenant {}: missing client/consultant.", tenantId);
            return;
        }

        Integer baseUserCount = parsePositiveIntSetting(tenantId, SettingKey.SIGNUP_USER_COUNT, 1);
        Integer baseSmsCount = parsePositiveIntSetting(tenantId, SettingKey.SIGNUP_SMS_COUNT, 0);
        Integer userCount = parsePositiveIntSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_NEXT_USER_COUNT, baseUserCount);
        Integer smsCount = parsePositiveIntSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_NEXT_SMS_COUNT, baseSmsCount);
        Integer currentUserAddCount = parsePositiveIntSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT, 0);
        Integer currentSmsAddCount = parsePositiveIntSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT, 0);
        List<String> signupAddonKeys = parseAddonKeyCsv(settingValueOrDefault(tenantId, SettingKey.SIGNUP_ADDON_KEYS, ""));
        List<String> addonKeys = parseAddonKeyCsv(settingValueOrDefault(tenantId, SettingKey.BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS, joinAddonKeys(signupAddonKeys)));
        List<String> currentAddonKeys = parseAddonKeyCsv(settingValueOrDefault(tenantId, SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS, ""));
        BigDecimal upgradeDiff = parseAmountSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_UPGRADE_DIFF_AMOUNT);

        String reference = referenceForTenant(tenantId);
        OpenBill open = openBills.findFirstByCompanyIdAndReferenceOrderByIdAsc(platformCompany.getId(), reference)
                .orElseGet(() -> {
                    OpenBill created = new OpenBill();
                    created.setCompany(platformCompany);
                    created.setReference(reference);
                    return created;
                });
        open.setClient(client);
        open.setConsultant(consultant);
        open.setPaymentMethod(resolvePaymentMethod(platformCompany.getId(), settingValueOrDefault(tenantId, SettingKey.BILLING_SUBSCRIPTION_PAYMENT_METHOD, null)).orElse(null));
        open.setBatchScope(OpenBill.BATCH_SCOPE_COMPANY);
        open.setBatchTargetClientId(null);
        open.setBatchTargetCompanyId(payee.getId());
        open.setSessionBooking(null);
        open.setBookingGroupKey(null);
        open.setBillType(BillType.INVOICE);

        BigDecimal totalGross = applySubscriptionLines(open, billingCatalog, plan, tenantId, userCount, smsCount, addonKeys, currentUserAddCount, currentSmsAddCount, currentAddonKeys);
        if (upgradeDiff.compareTo(BigDecimal.ZERO) > 0) {
            TransactionService diffTx = resolveBillingTransactionService(platformCompany, null, "SUBUPGDIFF", "Subscription upgrade difference", upgradeDiff);
            totalGross = totalGross.add(addOpenLine(open, diffTx, 1, upgradeDiff));
        }
        openBills.save(open);

        LocalDate newStart = previousEnd;
        LocalDate newEnd = periodEnd(newStart, plan.interval());
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_START, newStart.toString());
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_END, newEnd.toString());
        upsertSetting(tenant, SettingKey.SIGNUP_USER_COUNT, String.valueOf(Math.max(1, userCount == null ? 1 : userCount)));
        upsertSetting(tenant, SettingKey.SIGNUP_SMS_COUNT, String.valueOf(Math.max(0, smsCount == null ? 0 : smsCount)));
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT, "0");
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT, "0");
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS, "");
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_UPGRADE_DIFF_AMOUNT, "0");
        upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, totalGross.toPlainString());

        if (totalGross.compareTo(BigDecimal.ZERO) > 0) {
            Bill saved = createBillFromSignupOpenBill(open, platformCompany);
            startSubscriptionBillPayment(saved, platformCompany);
        }
    }

    private static int packageRank(String normalizedPackage) {
        return switch (normalizedPackage) {
            case "BASIC", "TRIAL" -> 1;
            case "PROFESSIONAL" -> 2;
            case "PREMIUM", "CUSTOM" -> 3;
            default -> 2;
        };
    }

    private BigDecimal periodGrossFor(RegisterPriceCatalog catalog, String packageName, BillingInterval interval) {
        Map<String, Double> prices = catalog == null || catalog.getPlans() == null ? Map.of() : catalog.getPlans();
        double annualDiscount = catalog == null || catalog.getAnnualDiscountPercent() == null ? 15.0 : catalog.getAnnualDiscountPercent();
        String normalized = normalizePackageType(packageName);
        BigDecimal monthly = switch (normalized) {
            case "PREMIUM" -> money(prices.getOrDefault("business", 59.90));
            case "PROFESSIONAL" -> money(prices.getOrDefault("pro", 34.90));
            case "CUSTOM" -> money(0.0);
            default -> money(prices.getOrDefault("basic", 18.90));
        };
        return interval == BillingInterval.YEARLY ? annualGross(monthly, annualDiscount) : monthly;
    }

    private BigDecimal parseAmountSetting(Long companyId, SettingKey key) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(String::trim)
                .filter(v -> !v.isBlank())
                .map(v -> {
                    try {
                        return new BigDecimal(v).max(BigDecimal.ZERO);
                    } catch (Exception e) {
                        return BigDecimal.ZERO;
                    }
                })
                .orElse(BigDecimal.ZERO);
    }

    /** Refresh open subscription bills from the tenant settings until they are converted into invoices. */
    @Scheduled(cron = "${app.platform-subscription-billing.daily-cron:0 10 0 * * *}")
    @SchedulerLock(name = "platformSubscriptionBillingService_refreshOpenSubscriptionBills", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Transactional
    public void refreshOpenSubscriptionBills() {
        jobTracker.run("platform-subscription-open-bill-refresh", () -> {
            Company platformCompany = resolvePlatformCompany().orElse(null);
            if (platformCompany == null || platformCompany.getId() == null) {
                return 0;
            }
            int refreshed = 0;
            RegisterPriceCatalog catalog = registerCatalogService.mergedCatalog();
            PlatformBillingCatalog billingCatalog = ensurePlatformBillingCatalog(platformCompany, catalog);
            try {
            for (OpenBill open : openBills.findAllByCompanyIdAndReferenceStartingWith(platformCompany.getId(), OPEN_BILL_REFERENCE_PREFIX)) {
            Long tenantId = parseTenantId(open.getReference());
            if (tenantId == null) {
                continue;
            }
            Company tenant = companies.findById(tenantId).orElse(null);
            if (tenant == null) {
                continue;
            }
            SimulatedTimeContext.set(tenantId);
            LocalDate today = timeService.localDate(ZoneId.systemDefault(), tenantId);
            String packageName = settings.findByCompanyIdAndKey(tenantId, SettingKey.SIGNUP_PACKAGE_NAME).map(AppSetting::getValue).orElse("PROFESSIONAL");
            String interval = settings.findByCompanyIdAndKey(tenantId, SettingKey.BILLING_SUBSCRIPTION_INTERVAL).map(AppSetting::getValue).orElse("MONTHLY");
            PlatformPlan plan = billingCatalog.resolvePlan(packageName, interval);
            if (plan == null && "CUSTOM".equals(normalizePackageType(packageName))) {
                plan = customPlan(platformCompany, tenant, interval);
            }
            if (plan == null) {
                continue;
            }
            Integer baseUserCount = parsePositiveIntSetting(tenantId, SettingKey.SIGNUP_USER_COUNT, 1);
            Integer baseSmsCount = parsePositiveIntSetting(tenantId, SettingKey.SIGNUP_SMS_COUNT, 0);
            Integer userCount = parsePositiveIntSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_NEXT_USER_COUNT, baseUserCount);
            Integer smsCount = parsePositiveIntSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_NEXT_SMS_COUNT, baseSmsCount);
            Integer currentUserAddCount = parsePositiveIntSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_CURRENT_USER_ADD_COUNT, 0);
            Integer currentSmsAddCount = parsePositiveIntSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_CURRENT_SMS_ADD_COUNT, 0);
            List<String> signupAddonKeys = parseAddonKeyCsv(settings.findByCompanyIdAndKey(tenantId, SettingKey.SIGNUP_ADDON_KEYS).map(AppSetting::getValue).orElse(""));
            List<String> addonKeys = parseAddonKeyCsv(settings.findByCompanyIdAndKey(tenantId, SettingKey.BILLING_SUBSCRIPTION_NEXT_ADDON_KEYS).map(AppSetting::getValue).orElse(joinAddonKeys(signupAddonKeys)));
            List<String> currentAddonKeys = parseAddonKeyCsv(settings.findByCompanyIdAndKey(tenantId, SettingKey.BILLING_SUBSCRIPTION_CURRENT_ADDON_KEYS).map(AppSetting::getValue).orElse(""));
            AppSetting billingStartSetting = settings.findByCompanyIdAndKey(tenantId, SettingKey.BILLING_SUBSCRIPTION_START)
                    .orElse(null);
            LocalDate billingStart = billingStartSetting == null ? null : parseDateOrNull(billingStartSetting.getValue());
            if (billingStart == null) {
                billingStart = resolveInitialBillingStart(plan, tenantId, today);
            }
            LocalDate billingEnd = periodEnd(billingStart, plan.interval());
            BigDecimal totalGross = applySubscriptionLines(open, billingCatalog, plan, tenantId, userCount, smsCount, addonKeys, currentUserAddCount, currentSmsAddCount, currentAddonKeys);
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_START, billingStart.toString());
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_END, billingEnd.toString());
            upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_DUE_AMOUNT, totalGross.toPlainString());
            openBills.save(open);
            refreshed++;
        }
            return refreshed;
        } finally {
            SimulatedTimeContext.clear();
        }
        });
    }

    /** Marks unpaid manually-created/self-serve subscription accounts as past due after the configured grace period. */
    @Scheduled(cron = "${app.platform-subscription-billing.status-cron:0 35 0 * * *}")
    @SchedulerLock(name = "platformSubscriptionBillingService_markPastDue", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    @Transactional
    public void markPastDueSubscriptions() {
        jobTracker.run("platform-subscription-past-due-scan", () -> {
            int changed = 0;
            for (AppSetting statusSetting : settings.findAllByKey(SettingKey.BILLING_SUBSCRIPTION_STATUS)) {
                Company tenant = statusSetting == null ? null : statusSetting.getCompany();
                if (tenant == null || tenant.getId() == null) {
                    continue;
                }
                String status = statusSetting.getValue() == null ? "" : statusSetting.getValue().trim().toUpperCase(Locale.ROOT);
                if (!"PENDING_PAYMENT".equals(status)) {
                    continue;
                }
                Long tenantId = tenant.getId();
                LocalDate start = settings.findByCompanyIdAndKey(tenantId, SettingKey.BILLING_SUBSCRIPTION_START)
                        .map(AppSetting::getValue)
                        .map(this::parseDateOrNull)
                        .orElse(null);
                int graceDays = parsePositiveIntSetting(tenantId, SettingKey.BILLING_SUBSCRIPTION_GRACE_DAYS, 30);
                LocalDate today = timeService.localDate(ZoneId.systemDefault(), tenantId);
                if (start != null && !start.plusDays(graceDays).isAfter(today)) {
                    upsertSetting(tenant, SettingKey.BILLING_SUBSCRIPTION_STATUS, "PAST_DUE");
                    changed++;
                }
            }
            return changed;
        });
    }

    /** Re-sends the latest platform subscription bill for a tenant, or recreates/starts the payment flow when only an open bill exists. */
    @Transactional(noRollbackFor = Exception.class)
    public SignupBillingInvoiceResult resendLatestSubscriptionPayment(Company tenantCompany) {
        if (tenantCompany == null || tenantCompany.getId() == null) {
            return SignupBillingInvoiceResult.empty();
        }
        Company platformCompany = resolvePlatformCompany().orElse(null);
        if (platformCompany == null || platformCompany.getId() == null) {
            return SignupBillingInvoiceResult.empty();
        }
        String reference = referenceForTenant(tenantCompany.getId());
        Optional<Bill> existing = findExistingSignupBill(platformCompany.getId(), reference);
        if (existing.isEmpty()) {
            return createInvoiceForSignupTenantIfDue(tenantCompany);
        }
        Bill bill = existing.get();
        PaymentMethod method = bill.getPaymentMethod();
        if (method != null && method.isStripeEnabled() && method.getPaymentType() == PaymentType.CARD) {
            StripeCheckoutSessionResult checkout = stripeBillingService.createCheckoutSessionForBill(bill);
            billingEmailService.sendCheckoutLink(bill, checkout.url());
            return new SignupBillingInvoiceResult(bill.getId(), bill.getBillNumber(), checkout.url(), BillPaymentStatus.PAYMENT_PENDING);
        }
        byte[] pdf = generateAndArchive(bill, platformCompany.getId());
        if (method != null && method.getPaymentType() == PaymentType.BANK_TRANSFER) {
            billingEmailService.sendBankTransferFolio(bill, pdf);
        } else {
            billingEmailService.sendInvoiceFolio(bill, pdf);
        }
        return new SignupBillingInvoiceResult(bill.getId(), bill.getBillNumber(), null, bill.getPaymentStatus());
    }

    private PlatformPlan customPlan(Company platformCompany, Company tenantCompany, String billingInterval) {
        if (platformCompany == null || tenantCompany == null || tenantCompany.getId() == null) {
            return null;
        }
        BillingInterval interval = normalizeInterval(billingInterval);
        BigDecimal monthly = parseMoneySetting(tenantCompany.getId(), SettingKey.BILLING_SUBSCRIPTION_CUSTOM_MONTHLY_PRICE);
        BigDecimal yearly = parseMoneySetting(tenantCompany.getId(), SettingKey.BILLING_SUBSCRIPTION_CUSTOM_YEARLY_PRICE);
        BigDecimal gross = interval == BillingInterval.YEARLY ? yearly : monthly;
        if (gross.compareTo(BigDecimal.ZERO) <= 0 && interval == BillingInterval.YEARLY) {
            gross = monthly.multiply(BigDecimal.valueOf(12)).setScale(2, RoundingMode.HALF_UP);
        }
        if (gross.compareTo(BigDecimal.ZERO) <= 0) {
            return null;
        }
        String displayName = firstNonBlank(
                settingValueOrDefault(tenantCompany.getId(), SettingKey.BILLING_SUBSCRIPTION_CUSTOM_NAME, ""),
                "Custom package"
        );
        String code = interval == BillingInterval.YEARLY ? "CUSTOM_Y" : "CUSTOM_M";
        String description = displayName + (interval == BillingInterval.YEARLY ? " - Annual" : " - Monthly");
        TransactionService tx = resolveBillingTransactionService(platformCompany, null, code, description, gross);
        return new PlatformPlan(PackageType.CUSTOM, interval, gross, tx, code);
    }

    private BigDecimal parseMoneySetting(Long companyId, SettingKey key) {
        String raw = settingValueOrDefault(companyId, key, "0");
        if (raw == null || raw.isBlank()) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(raw.trim().replace(',', '.')).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }

    private Bill createBillFromSignupOpenBill(OpenBill open, Company platformCompany) {
        Bill bill = new Bill();
        bill.setCompany(platformCompany);
        bill.setBillType(BillType.INVOICE);
        bill.setBillNumber(nextInvoiceNumber(platformCompany.getId()));
        bill.setClient(open.getClient());
        setBillClientSnapshot(bill, open.getClient());
        if (OpenBill.BATCH_SCOPE_COMPANY.equals(open.getBatchScope()) && open.getBatchTargetCompanyId() != null) {
            ClientCompany recipientCompany = clientCompanies.findByIdAndOwnerCompanyId(open.getBatchTargetCompanyId(), platformCompany.getId())
                    .orElse(null);
            if (recipientCompany != null) {
                setBillRecipientCompanySnapshot(bill, recipientCompany);
                bill.setClient(null);
                bill.setClientFirstNameSnapshot("");
                bill.setClientLastNameSnapshot("");
            } else {
                setBillRecipientPersonSnapshot(bill);
            }
        } else {
            setBillRecipientPersonSnapshot(bill);
        }
        bill.setConsultant(open.getConsultant());
        bill.setPaymentMethod(open.getPaymentMethod() != null ? open.getPaymentMethod() : resolvePaymentMethod(platformCompany.getId(), null).orElse(null));
        bill.setBankTransferReference(open.getReference());
        bill.setIssueDate(timeService.localDate());
        bill.setFiscalStatus(BillFiscalStatus.NOT_SENT);

        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        for (OpenBillItem source : open.getItems()) {
            if (source.getTransactionService() == null || source.getQuantity() == null || source.getQuantity() <= 0) {
                continue;
            }
            BillItem item = new BillItem();
            item.setBill(bill);
            item.setTransactionService(source.getTransactionService());
            item.setQuantity(source.getQuantity());
            item.setNetPrice(source.getNetPrice());
            BigDecimal grossSingle = source.getUnitGrossPrice() != null
                    ? source.getUnitGrossPrice()
                    : grossFromNet(source.getTransactionService(), source.getNetPrice());
            item.setGrossPrice(grossSingle.multiply(BigDecimal.valueOf(source.getQuantity())).setScale(2, RoundingMode.HALF_UP));
            item.setSourceSessionBookingId(null);
            item.setSourceAdvanceBillId(null);
            totalNet = totalNet.add(source.getNetPrice().multiply(BigDecimal.valueOf(source.getQuantity())));
            totalGross = totalGross.add(item.getGrossPrice());
            bill.getItems().add(item);
        }
        bill.setTotalNet(totalNet.setScale(2, RoundingMode.HALF_UP));
        bill.setTotalGross(totalGross.setScale(2, RoundingMode.HALF_UP));
        bill.setPaymentStatus(bill.getPaymentMethod() != null && bill.getPaymentMethod().isStripeEnabled()
                ? BillPaymentStatus.OPEN
                : BillPaymentStatus.PAYMENT_PENDING);
        invoiceOrderIdService.assignIfMissing(bill);
        Bill saved = bills.saveAndFlush(bill);
        openBills.delete(open);
        openBills.flush();
        return saved;
    }

    private byte[] generateAndArchive(Bill bill, Long companyId) {
        try {
            byte[] pdf = billFolioPdfService.generate(bill, companyId);
            invoicePdfS3Service.uploadAndPersistKey(bill, pdf);
            return pdf;
        } catch (Exception e) {
            log.warn("Could not generate/archive signup subscription PDF for billId={}", bill == null ? null : bill.getId(), e);
            return new byte[0];
        }
    }

    private Optional<Bill> findExistingSignupBill(Long platformCompanyId, String reference) {
        if (platformCompanyId == null || reference == null) {
            return Optional.empty();
        }
        return bills.findAllByCompanyId(platformCompanyId).stream()
                .filter(b -> reference.equals(b.getBankTransferReference()))
                .max(Comparator.comparing(Bill::getId));
    }

    private BigDecimal applySubscriptionLines(
            OpenBill open,
            PlatformBillingCatalog catalog,
            PlatformPlan plan,
            Long tenantId,
            Integer selectedUserCount,
            Integer selectedSmsCount,
            List<String> selectedAddonKeys,
            Integer currentUserAddCount,
            Integer currentSmsAddCount,
            List<String> currentAddonKeys
    ) {
        if (open.getItems() != null) {
            open.getItems().clear();
        }
        BigDecimal totalGross = BigDecimal.ZERO;
        BigDecimal planGross = plan.periodGross();
        if (planGross.compareTo(BigDecimal.ZERO) > 0) {
            totalGross = totalGross.add(addOpenLine(open, plan.transactionService(), 1, planGross));
        }

        if (plan.packageType() != PackageType.CUSTOM) {
            BigDecimal userUnitGross = plan.interval() == BillingInterval.YEARLY
                    ? annualGross(catalog.additionalUserMonthly(), catalog.annualDiscountPercent())
                    : catalog.additionalUserMonthly();
            int billableCurrentUsers = Math.max(0, currentUserAddCount == null ? 0 : currentUserAddCount);
            if (billableCurrentUsers > 0 && catalog.additionalUserService() != null && catalog.additionalUserMonthly().compareTo(BigDecimal.ZERO) > 0) {
                totalGross = totalGross.add(addOpenLine(open, catalog.additionalUserService(), billableCurrentUsers, userUnitGross));
            }

            int billableUsers = Math.max(0, (selectedUserCount == null ? 1 : selectedUserCount) - baseIncludedUsers(plan.packageType()));
            if (billableUsers > 0 && catalog.additionalUserService() != null && catalog.additionalUserMonthly().compareTo(BigDecimal.ZERO) > 0) {
                totalGross = totalGross.add(addOpenLine(open, catalog.additionalUserService(), billableUsers, userUnitGross));
            }

            BigDecimal smsUnitGross = plan.interval() == BillingInterval.YEARLY
                    ? catalog.smsPerMessage().multiply(BigDecimal.valueOf(12)).setScale(2, RoundingMode.HALF_UP)
                    : catalog.smsPerMessage();
            int currentSmsCount = Math.max(0, currentSmsAddCount == null ? 0 : currentSmsAddCount);
            if (currentSmsCount > 0 && catalog.smsService() != null && catalog.smsPerMessage().compareTo(BigDecimal.ZERO) > 0) {
                totalGross = totalGross.add(addOpenLine(open, catalog.smsService(), currentSmsCount, smsUnitGross));
            }

            int smsCount = Math.max(0, selectedSmsCount == null ? 0 : selectedSmsCount);
            if (smsCount > 0 && catalog.smsService() != null && catalog.smsPerMessage().compareTo(BigDecimal.ZERO) > 0) {
                totalGross = totalGross.add(addOpenLine(open, catalog.smsService(), smsCount, smsUnitGross));
            }
        }

        for (String key : currentAddonKeys == null ? List.<String>of() : currentAddonKeys) {
            totalGross = totalGross.add(addAddonOpenLine(open, catalog, plan, tenantId, key));
        }

        for (String key : selectedAddonKeys == null ? List.<String>of() : selectedAddonKeys) {
            totalGross = totalGross.add(addAddonOpenLine(open, catalog, plan, tenantId, key));
        }
        return totalGross.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal addAddonOpenLine(OpenBill open, PlatformBillingCatalog catalog, PlatformPlan plan, Long tenantId, String rawKey) {
        String key = normalizeAddonKey(rawKey);
        if (key.isBlank()) {
            return BigDecimal.ZERO;
        }
        PlatformAddon addon = catalog.addons().get(key);
        if (addon == null || addon.transactionService() == null) {
            return BigDecimal.ZERO;
        }
        BigDecimal unitGross = customAddonGross(tenantId, plan, key)
                .orElseGet(() -> plan.interval() == BillingInterval.YEARLY
                        ? annualGross(addon.monthlyGross(), catalog.annualDiscountPercent())
                        : addon.monthlyGross());
        if (unitGross.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }
        return addOpenLine(open, addon.transactionService(), 1, unitGross);
    }

    private Optional<BigDecimal> customAddonGross(Long tenantId, PlatformPlan plan, String key) {
        if (tenantId == null || plan == null || plan.packageType() != PackageType.CUSTOM || objectMapper == null) {
            return Optional.empty();
        }
        String json = settingValueOrDefault(tenantId, SettingKey.BILLING_SUBSCRIPTION_CUSTOM_ADDONS_JSON, "");
        if (json == null || json.isBlank()) {
            return Optional.empty();
        }
        try {
            List<Map<String, Object>> rows = objectMapper.readValue(json, new TypeReference<>() {});
            for (Map<String, Object> row : rows) {
                if (row == null || !key.equals(normalizeAddonKey(String.valueOf(row.getOrDefault("key", ""))))) {
                    continue;
                }
                Object charged = row.get("charged");
                if (charged != null && !Boolean.parseBoolean(String.valueOf(charged))) {
                    return Optional.of(BigDecimal.ZERO);
                }
                String field = plan.interval() == BillingInterval.YEARLY ? "yearlyPrice" : "monthlyPrice";
                BigDecimal amount = parseMoneyObject(row.get(field));
                if (amount.compareTo(BigDecimal.ZERO) <= 0 && plan.interval() == BillingInterval.YEARLY) {
                    amount = parseMoneyObject(row.get("monthlyPrice")).multiply(BigDecimal.valueOf(12)).setScale(2, RoundingMode.HALF_UP);
                }
                return Optional.of(amount);
            }
        } catch (Exception ignored) {
            return Optional.empty();
        }
        return Optional.empty();
    }

    private BigDecimal parseMoneyObject(Object value) {
        if (value == null) {
            return BigDecimal.ZERO;
        }
        try {
            return new BigDecimal(String.valueOf(value).trim().replace(',', '.')).max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        } catch (Exception e) {
            return BigDecimal.ZERO;
        }
    }

    private BigDecimal addOpenLine(OpenBill open, TransactionService tx, int quantity, BigDecimal targetGrossPerUnit) {
        if (tx == null || quantity <= 0 || targetGrossPerUnit == null || targetGrossPerUnit.compareTo(BigDecimal.ZERO) <= 0) {
            return BigDecimal.ZERO;
        }
        OpenBillItem item = new OpenBillItem();
        item.setOpenBill(open);
        item.setTransactionService(tx);
        item.setQuantity(quantity);
        item.setNetPrice(netFromGross(tx, targetGrossPerUnit));
        item.setUnitGrossPrice(targetGrossPerUnit.setScale(2, RoundingMode.HALF_UP));
        item.setSourceSessionBookingId(null);
        item.setSourceAdvanceBillId(null);
        open.getItems().add(item);
        return targetGrossPerUnit.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal openBillTotalGross(OpenBill open) {
        if (open == null || open.getItems() == null) {
            return BigDecimal.ZERO;
        }
        return open.getItems().stream()
                .filter(i -> i.getTransactionService() != null && i.getQuantity() != null)
                .map(i -> (i.getUnitGrossPrice() != null
                        ? i.getUnitGrossPrice()
                        : grossFromNet(i.getTransactionService(), i.getNetPrice() == null ? BigDecimal.ZERO : i.getNetPrice()))
                        .multiply(BigDecimal.valueOf(i.getQuantity())))
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
    }

    private PlatformBillingCatalog ensurePlatformBillingCatalog(Company platformCompany, RegisterPriceCatalog catalog) {
        Map<String, Double> prices = catalog == null || catalog.getPlans() == null ? Map.of() : catalog.getPlans();
        double annualDiscount = catalog == null || catalog.getAnnualDiscountPercent() == null ? 15.0 : catalog.getAnnualDiscountPercent();
        Map<String, Long> planMappings = catalog == null || catalog.getPlanTransactionServiceIds() == null ? Map.of() : catalog.getPlanTransactionServiceIds();
        BigDecimal basic = money(prices.getOrDefault("basic", 18.90));
        BigDecimal pro = money(prices.getOrDefault("pro", 34.90));
        BigDecimal business = money(prices.getOrDefault("business", 59.90));
        String basicName = planDisplayName(catalog, "basic", "Basic");
        String proName = planDisplayName(catalog, "pro", "Pro");
        String businessName = planDisplayName(catalog, "business", "Business");

        Map<String, PlatformPlan> plans = new LinkedHashMap<>();
        plans.put("BASIC:MONTHLY", plan(platformCompany, "basicMonthly", "BASIC_M", basicName + " Package - Monthly", PackageType.BASIC, BillingInterval.MONTHLY, basic, planMappings));
        plans.put("BASIC:YEARLY", plan(platformCompany, "basicAnnual", "BASIC_Y", basicName + " Package - Annual", PackageType.BASIC, BillingInterval.YEARLY, annualGross(basic, annualDiscount), planMappings));
        plans.put("PROFESSIONAL:MONTHLY", plan(platformCompany, "proMonthly", "PRO_M", proName + " Package - Monthly", PackageType.PROFESSIONAL, BillingInterval.MONTHLY, pro, planMappings));
        plans.put("PROFESSIONAL:YEARLY", plan(platformCompany, "proAnnual", "PRO_Y", proName + " Package - Annual", PackageType.PROFESSIONAL, BillingInterval.YEARLY, annualGross(pro, annualDiscount), planMappings));
        plans.put("PREMIUM:MONTHLY", plan(platformCompany, "businessMonthly", "BUS_M", businessName + " Package - Monthly", PackageType.PREMIUM, BillingInterval.MONTHLY, business, planMappings));
        plans.put("PREMIUM:YEARLY", plan(platformCompany, "businessAnnual", "BUS_Y", businessName + " Package - Annual", PackageType.PREMIUM, BillingInterval.YEARLY, annualGross(business, annualDiscount), planMappings));

        BigDecimal additionalUserMonthly = money(catalog == null || catalog.getAdditionalUserMonthly() == null ? 9.9 : catalog.getAdditionalUserMonthly());
        BigDecimal smsPerMessage = money4(catalog == null || catalog.getSmsPerMessage() == null ? 0.05 : catalog.getSmsPerMessage());
        TransactionService additionalUserService = resolveBillingTransactionService(
                platformCompany,
                catalog == null ? null : catalog.getAdditionalUserTransactionServiceId(),
                "ADDUSER",
                "Additional user / month",
                additionalUserMonthly
        );
        TransactionService smsService = resolveBillingTransactionService(
                platformCompany,
                catalog == null ? null : catalog.getSmsTransactionServiceId(),
                "SMSMSG",
                "SMS message",
                smsPerMessage
        );

        Map<String, PlatformAddon> addons = new LinkedHashMap<>();
        if (catalog != null && catalog.getAddonItems() != null) {
            for (RegisterPriceCatalog.AddonItem item : catalog.getAddonItems()) {
                if (item == null || Boolean.FALSE == item.getActive()) continue;
                String key = normalizeAddonKey(item.getKey());
                if (key.isBlank()) continue;
                BigDecimal monthlyGross = money(item.getMonthly() == null ? 0.0 : item.getMonthly());
                TransactionService tx = resolveBillingTransactionService(
                        platformCompany,
                        item.getTransactionServiceId(),
                        "ADDON_" + key.toUpperCase(Locale.ROOT).replace('-', '_'),
                        firstNonBlank(item.getName(), titleFromKey(key)) + " add-on",
                        monthlyGross
                );
                addons.put(key, new PlatformAddon(key, monthlyGross, tx));
            }
        }
        return new PlatformBillingCatalog(plans, addons, additionalUserService, additionalUserMonthly, smsService, smsPerMessage, annualDiscount);
    }

    private String planDisplayName(RegisterPriceCatalog catalog, String key, String fallback) {
        if (catalog == null || catalog.getPlanNames() == null) {
            return fallback;
        }
        RegisterPriceCatalog.PlanName planName = catalog.getPlanNames().get(key);
        return firstNonBlank(planName == null ? null : planName.getName(), fallback);
    }

    private PlatformPlan plan(
            Company platformCompany,
            String mappingKey,
            String fallbackCode,
            String description,
            PackageType packageType,
            BillingInterval interval,
            BigDecimal periodGross,
            Map<String, Long> mappings
    ) {
        TransactionService tx = resolveBillingTransactionService(platformCompany, mappings.get(mappingKey), fallbackCode, description, periodGross);
        return new PlatformPlan(packageType, interval, periodGross, tx, fallbackCode);
    }

    private TransactionService resolveBillingTransactionService(Company platformCompany, Long mappedId, String fallbackCode, String description, BigDecimal defaultGross) {
        if (mappedId != null && mappedId > 0) {
            TransactionService mapped = txServices.findByIdAndCompanyId(mappedId, platformCompany.getId()).orElse(null);
            if (mapped != null) {
                return mapped;
            }
        }
        String serviceCode = normalizeBillingTransactionServiceCode(fallbackCode);
        TransactionService tx = txServices.findByCompanyIdAndCodeIgnoreCase(platformCompany.getId(), serviceCode)
                .orElseGet(() -> {
                    TransactionService created = new TransactionService();
                    created.setCompany(platformCompany);
                    created.setCode(serviceCode);
                    return created;
                });
        boolean dirty = false;
        if (!Objects.equals(tx.getDescription(), description)) {
            tx.setDescription(description);
            dirty = true;
        }
        if (tx.getTaxRate() != TaxRate.NO_VAT) {
            tx.setTaxRate(TaxRate.NO_VAT);
            dirty = true;
        }
        BigDecimal net = defaultGross == null ? BigDecimal.ZERO : defaultGross.setScale(4, RoundingMode.HALF_UP);
        if (tx.getNetPrice() == null || tx.getNetPrice().compareTo(net) != 0) {
            tx.setNetPrice(net);
            dirty = true;
        }
        if (!tx.isActive()) {
            tx.setActive(true);
            dirty = true;
        }
        if (tx.getId() == null || dirty) {
            tx = txServices.save(tx);
        }
        return tx;
    }

    private String normalizeBillingTransactionServiceCode(String raw) {
        String normalized = raw == null ? "" : raw.trim().toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (normalized.isBlank()) {
            normalized = "SERVICE";
        }
        if (normalized.length() <= TRANSACTION_SERVICE_CODE_MAX_LENGTH) {
            return normalized;
        }
        String hash = compactCodeHash(normalized);
        int prefixLength = Math.max(1, TRANSACTION_SERVICE_CODE_MAX_LENGTH - hash.length());
        return normalized.substring(0, prefixLength) + hash;
    }

    private String compactCodeHash(String value) {
        CRC32 crc = new CRC32();
        crc.update(value.getBytes(java.nio.charset.StandardCharsets.UTF_8));
        String hash = Long.toString(crc.getValue(), 36).toUpperCase(Locale.ROOT).replaceAll("[^A-Z0-9]", "");
        if (hash.length() < 4) {
            hash = ("0000" + hash);
        }
        return hash.substring(hash.length() - 4);
    }

    private String settingValueOrDefault(Long companyId, SettingKey key, String fallback) {
        if (companyId == null || key == null) {
            return fallback;
        }
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .filter(v -> v != null && !v.isBlank())
                .orElse(fallback);
    }

    private static String joinAddonKeys(List<String> keys) {
        return String.join(",", keys == null ? List.<String>of() : keys);
    }

    private LocalDate resolveInitialBillingStart(PlatformPlan plan, Long tenantId, LocalDate today) {
        if (plan.interval() == BillingInterval.MONTHLY && plan.packageType() == PackageType.BASIC) {
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

    private int baseIncludedUsers(PackageType packageType) {
        return switch (packageType) {
            case BASIC -> 1;
            case PROFESSIONAL -> 5;
            case PREMIUM -> 10;
            case CUSTOM -> 1;
        };
    }

    private ClientCompany upsertPlatformPayeeCompany(
            Company platformCompany,
            Company tenantCompany,
            String name,
            String vatId,
            String address,
            String postalCode,
            String city,
            String email,
            String phone
    ) {
        String normalizedVat = ClientCompany.normalizeVatIdStorage(vatId);
        ClientCompany row = tenantCompany == null || tenantCompany.getId() == null
                ? null
                : clientCompanies.findFirstLinkedPlatformPayee(platformCompany.getId(), tenantCompany.getId()).orElse(null);
        if (row == null && normalizedVat != null) {
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
        if (tenantCompany != null && tenantCompany.getId() != null) {
            row.setPlatformTenantCompany(tenantCompany);
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

    private String nextInvoiceNumber(Long companyId) {
        AppSetting setting = settings.findForUpdateByCompanyIdAndKey(companyId, SettingKey.INVOICE_COUNTER)
                .orElseThrow(() -> new IllegalStateException("Missing setting: INVOICE_COUNTER"));
        String current = setting.getValue();
        setting.setValue(incrementAlphaNumeric(current));
        settings.save(setting);
        return current;
    }

    static String incrementAlphaNumeric(String value) {
        if (value == null || value.isBlank()) return "1";
        String v = value.trim();
        var m = java.util.regex.Pattern.compile("^(.*?)(\\d+)$").matcher(v);
        if (m.matches()) {
            String prefix = m.group(1);
            String digits = m.group(2);
            long n = Long.parseLong(digits);
            String next = String.valueOf(n + 1);
            if (next.length() < digits.length()) {
                next = "0".repeat(digits.length() - next.length()) + next;
            }
            return prefix + next;
        }
        return v + "1";
    }

    private static boolean shouldFiscalizeOnBillCreate(PaymentMethod paymentMethod) {
        return paymentMethod != null && paymentMethod.isFiscalized();
    }

    private static void setBillClientSnapshot(Bill bill, Client client) {
        if (client == null) {
            bill.setClientFirstNameSnapshot("");
            bill.setClientLastNameSnapshot("");
            return;
        }
        bill.setClientFirstNameSnapshot(client.getFirstName() == null ? "" : client.getFirstName());
        bill.setClientLastNameSnapshot(client.getLastName() == null ? "" : client.getLastName());
    }

    private static void setBillRecipientPersonSnapshot(Bill bill) {
        bill.setRecipientTypeSnapshot("PERSON");
        bill.setRecipientPersonEmailSnapshot(null);
        bill.setRecipientCompanyIdSnapshot(null);
        bill.setRecipientCompanyNameSnapshot(null);
        bill.setRecipientCompanyAddressSnapshot(null);
        bill.setRecipientCompanyPostalCodeSnapshot(null);
        bill.setRecipientCompanyCitySnapshot(null);
        bill.setRecipientCompanyVatIdSnapshot(null);
        bill.setRecipientCompanyIbanSnapshot(null);
        bill.setRecipientCompanyEmailSnapshot(null);
        bill.setRecipientCompanyTelephoneSnapshot(null);
    }

    private static void setBillRecipientCompanySnapshot(Bill bill, ClientCompany company) {
        bill.setRecipientTypeSnapshot("COMPANY");
        bill.setRecipientPersonEmailSnapshot(null);
        bill.setRecipientCompanyIdSnapshot(company.getId());
        bill.setRecipientCompanyNameSnapshot(company.getName());
        bill.setRecipientCompanyAddressSnapshot(company.getAddress());
        bill.setRecipientCompanyPostalCodeSnapshot(company.getPostalCode());
        bill.setRecipientCompanyCitySnapshot(company.getCity());
        bill.setRecipientCompanyVatIdSnapshot(company.getVatId());
        bill.setRecipientCompanyIbanSnapshot(company.getIban());
        bill.setRecipientCompanyEmailSnapshot(company.getEmail());
        bill.setRecipientCompanyTelephoneSnapshot(company.getTelephone());
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

    private Integer parsePositiveIntSetting(Long companyId, SettingKey key, int defaultVal) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(AppSetting::getValue)
                .map(v -> {
                    try {
                        return Math.max(0, Integer.parseInt(v.trim()));
                    } catch (Exception e) {
                        return defaultVal;
                    }
                })
                .orElse(defaultVal);
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

    private static BigDecimal netFromGross(TransactionService tx, BigDecimal gross) {
        BigDecimal multiplier = tx == null || tx.getTaxRate() == null ? BigDecimal.ZERO : tx.getTaxRate().multiplier;
        return gross.divide(BigDecimal.ONE.add(multiplier), 4, RoundingMode.HALF_UP);
    }

    private static BigDecimal grossFromNet(TransactionService tx, BigDecimal net) {
        BigDecimal multiplier = tx == null || tx.getTaxRate() == null ? BigDecimal.ZERO : tx.getTaxRate().multiplier;
        return net.multiply(BigDecimal.ONE.add(multiplier)).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal money(Double value) {
        return BigDecimal.valueOf(value == null ? 0.0 : value).setScale(2, RoundingMode.HALF_UP);
    }

    private static BigDecimal money4(Double value) {
        return BigDecimal.valueOf(value == null ? 0.0 : value).setScale(4, RoundingMode.HALF_UP);
    }

    private static BigDecimal annualGross(BigDecimal monthly, double annualDiscountPercent) {
        double clampedDiscount = Math.max(0.0, Math.min(100.0, annualDiscountPercent));
        BigDecimal factor = BigDecimal.valueOf(1.0 - (clampedDiscount / 100.0));
        return monthly.multiply(BigDecimal.valueOf(12)).multiply(factor).setScale(2, RoundingMode.HALF_UP);
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
        if ("BASIC".equals(normalized) || "TRIAL".equals(normalized) || "PROFESSIONAL".equals(normalized) || "PREMIUM".equals(normalized) || "CUSTOM".equals(normalized)) {
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

    private static String normalizeAddonKey(String raw) {
        return raw == null ? "" : raw.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9]+", "-").replaceAll("^-|-$", "");
    }

    private static List<String> parseAddonKeyCsv(String csv) {
        if (csv == null || csv.isBlank()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        for (String part : csv.split(",")) {
            String key = normalizeAddonKey(part);
            if (!key.isBlank() && !out.contains(key)) {
                out.add(key);
            }
        }
        return out;
    }

    private static String titleFromKey(String key) {
        if (key == null || key.isBlank()) return "Custom item";
        String cleaned = key.replace('-', ' ');
        return Character.toUpperCase(cleaned.charAt(0)) + cleaned.substring(1);
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

    public record SignupBillingInvoiceResult(Long billId, String billNumber, String checkoutUrl, String paymentStatus) {
        private static SignupBillingInvoiceResult empty() {
            return new SignupBillingInvoiceResult(null, null, null, null);
        }
    }

    /** Outcome of a self-serve package/interval change. {@code changeKind} is UPGRADE, DOWNGRADE or NONE. */
    public record PackageChangeResult(
            String currentPackage,
            String nextPackage,
            String interval,
            String nextInterval,
            BigDecimal pendingUpgradeDiff,
            String changeKind
    ) {
        private static PackageChangeResult none(String currentPackage, String interval) {
            return new PackageChangeResult(currentPackage, currentPackage, interval, interval, BigDecimal.ZERO, "NONE");
        }
    }

    private enum PackageType {
        BASIC,
        PROFESSIONAL,
        PREMIUM,
        CUSTOM
    }

    private enum BillingInterval {
        MONTHLY,
        YEARLY;

        private String settingValue() {
            return this == YEARLY ? "YEARLY" : "MONTHLY";
        }
    }

    private record PlatformPlan(
            PackageType packageType,
            BillingInterval interval,
            BigDecimal periodGross,
            TransactionService transactionService,
            String fallbackCode
    ) {
    }

    private record PlatformAddon(String key, BigDecimal monthlyGross, TransactionService transactionService) {
    }

    private record PlatformBillingCatalog(
            Map<String, PlatformPlan> plans,
            Map<String, PlatformAddon> addons,
            TransactionService additionalUserService,
            BigDecimal additionalUserMonthly,
            TransactionService smsService,
            BigDecimal smsPerMessage,
            double annualDiscountPercent
    ) {
        private PlatformPlan resolvePlan(String packageName, String billingInterval) {
            String normalizedPackage = normalizePackageType(packageName);
            String normalizedInterval = normalizeInterval(billingInterval).settingValue();
            if ("TRIAL".equals(normalizedPackage)) {
                normalizedPackage = "BASIC";
                normalizedInterval = "MONTHLY";
            }
            return plans.get(normalizedPackage + ":" + normalizedInterval);
        }
    }
}
