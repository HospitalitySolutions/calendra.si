package com.example.app.stripe;

import com.example.app.billing.Bill;
import com.example.app.billing.BillPaymentStatus;
import com.example.app.billing.BillRepository;
import com.example.app.billing.PaymentMethod;
import com.example.app.billing.UpnQrPayloadBuilder;
import com.example.app.billing.PaymentType;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.OffsetDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StripeBillingService {
    private final BillRepository bills;
    private final StripeCheckoutClient stripeCheckoutClient;
    private final StripeInvoiceClient stripeInvoiceClient;
    private final StripeConfig stripeConfig;
    private final StripeConnectService stripeConnectService;
    private final StripePlatformSettingsService stripePlatformSettingsService;
    private final Environment environment;

    @Autowired
    public StripeBillingService(
            BillRepository bills,
            StripeCheckoutClient stripeCheckoutClient,
            StripeInvoiceClient stripeInvoiceClient,
            StripeConfig stripeConfig,
            StripeConnectService stripeConnectService,
            StripePlatformSettingsService stripePlatformSettingsService,
            Environment environment
    ) {
        this.bills = bills;
        this.stripeCheckoutClient = stripeCheckoutClient;
        this.stripeInvoiceClient = stripeInvoiceClient;
        this.stripeConfig = stripeConfig;
        this.stripeConnectService = stripeConnectService;
        this.stripePlatformSettingsService = stripePlatformSettingsService;
        this.environment = environment;
    }

    /** Backwards-compatible constructor for older unit tests. */
    StripeBillingService(BillRepository bills, StripeCheckoutClient stripeCheckoutClient, StripeInvoiceClient stripeInvoiceClient, StripeConfig stripeConfig) {
        this(bills, stripeCheckoutClient, stripeInvoiceClient, stripeConfig, null, null, null);
    }

    public StripeCheckoutSessionResult createCheckoutSessionForBill(Bill bill) {
        validateBillAmount(bill);
        String paymentStatus = normalizeStatus(bill.getPaymentStatus());
        if (BillPaymentStatus.PAID.equals(paymentStatus)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bill is already paid.");
        }
        if (BillPaymentStatus.PAYMENT_PENDING.equals(paymentStatus) && bill.getCheckoutSessionId() != null && !bill.getCheckoutSessionId().isBlank()) {
            OffsetDateTime expiresAt = bill.getCheckoutSessionExpiresAt();
            if (expiresAt == null || expiresAt.isAfter(OffsetDateTime.now())) {
                throw new ResponseStatusException(HttpStatus.CONFLICT, "Active checkout session already exists for this bill.");
            }
            bill.setPaymentStatus(BillPaymentStatus.CANCELLED);
        }

        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("source", "bill_checkout");
        metadata.put("bill_id", String.valueOf(bill.getId()));
        metadata.put("company_id", bill.getCompany() == null ? "" : String.valueOf(bill.getCompany().getId()));
        metadata.put("client_id", bill.getClient() == null ? "" : String.valueOf(bill.getClient().getId()));
        metadata.put("session_id", bill.getSourceSessionIdSnapshot() == null ? "" : String.valueOf(bill.getSourceSessionIdSnapshot()));

        StripeConnectService.ConnectedAccountRouting routing = checkoutRoutingForCompany(bill.getCompany());
        StripeCheckoutSessionResult session;
        if (routing != null) {
            bill.setStripeConnectMode(routing.mode().apiValue());
            bill.setStripeConnectedAccountId(routing.accountId());
            metadata.put("stripe_connect_mode", routing.mode().apiValue());
            metadata.put("stripe_connected_account_id", routing.accountId());
            // Manual bill payment links are tenant-owned payments. Do not deduct the
            // Platform Admin application fee here; otherwise the connected account can
            // show little/no net amount if the fee is configured high. The connected
            // account still pays Stripe processing fees because this is a direct charge
            // created with the Stripe-Account header in StripeCheckoutClient.
            long applicationFee = 0L;
            metadata.put("application_fee_amount_minor", "0");
            session = stripeCheckoutClient.createOneTimeSession(new StripeCheckoutClient.StripeCheckoutSessionCreateRequest(
                    routing.modeSettings().secretKey(),
                    billingReturnUrl(bill, "success"),
                    billingCancelUrl(bill),
                    "Calendra invoice " + bill.getBillNumber(),
                    bill.getTotalGross(),
                    routing.modeSettings().currency(),
                    bill.getClient() == null ? null : bill.getClient().getEmail(),
                    metadata,
                    metadata,
                    routing.accountId(),
                    applicationFee,
                    "bill-checkout-" + bill.getId() + "-" + routing.mode().apiValue() + "-" + System.currentTimeMillis()
            ));
        } else {
            session = stripeCheckoutClient.createOneTimeSession(new StripeCheckoutClient.StripeCheckoutSessionCreateRequest(
                    stripeConfig.secretKey(),
                    billingReturnUrl(bill, "success"),
                    billingCancelUrl(bill),
                    "Calendra invoice " + bill.getBillNumber(),
                    bill.getTotalGross(),
                    stripeConfig.currency(),
                    bill.getClient() == null ? null : bill.getClient().getEmail(),
                    metadata,
                    Map.of(),
                    null,
                    0L,
                    "bill-checkout-" + bill.getId() + "-legacy-" + System.currentTimeMillis()
            ));
        }
        bill.setCheckoutSessionId(session.id());
        bill.setCheckoutSessionExpiresAt(session.expiresAt());
        bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);
        bills.save(bill);
        return session;
    }

    public void assertCheckoutReadyForCompany(com.example.app.company.Company company) {
        checkoutRoutingForCompany(company);
    }

    private StripeConnectService.ConnectedAccountRouting checkoutRoutingForCompany(com.example.app.company.Company company) {
        if (stripeConnectService != null && stripePlatformSettingsService != null && company != null) {
            try {
                return stripeConnectService.routingForCompany(company);
            } catch (ResponseStatusException ex) {
                throw stripeSetupRequired(firstNonBlank(ex.getReason(), "Stripe Connect is not ready. Finish onboarding first."));
            }
        }
        if (stripeConfig == null || stripeConfig.secretKey() == null || stripeConfig.secretKey().isBlank()) {
            throw stripeSetupRequired("Stripe is not configured. Add the Stripe secret key before creating card payment links.");
        }
        return null;
    }

    private ResponseStatusException stripeSetupRequired(String detail) {
        String suffix = detail == null || detail.isBlank() ? "Stripe is not setup." : detail.trim();
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "STRIPE_SETUP_REQUIRED: " + suffix);
    }

    public StripeBankTransferInvoiceResult createOrReuseBankTransferInvoiceForBill(Bill bill, int daysUntilDue) {
        validateBillAmount(bill);
        String paymentStatus = normalizeStatus(bill.getPaymentStatus());
        if (BillPaymentStatus.PAID.equals(paymentStatus)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Bill is already paid.");
        }
        if (bill.getStripeInvoiceId() != null && !bill.getStripeInvoiceId().isBlank()
                && bill.getStripeHostedInvoiceUrl() != null && !bill.getStripeHostedInvoiceUrl().isBlank()) {
            if (hasStoredBankTransferDetails(bill)) {
                return new StripeBankTransferInvoiceResult(
                        bill.getStripeCustomerId(),
                        bill.getStripeInvoiceId(),
                        bill.getStripeHostedInvoiceUrl(),
                        "open",
                        bill.getStripeInvoiceNumber(),
                        bill.getStripeBankTransferIban(),
                        bill.getStripeBankTransferBic(),
                        bill.getStripeBankTransferAccountHolderName(),
                        bill.getStripeBankTransferAccountHolderAddressLine1(),
                        bill.getStripeBankTransferAccountHolderPostalCode(),
                        bill.getStripeBankTransferAccountHolderCity(),
                        bill.getStripeBankTransferAccountHolderCountry()
                );
            }
            StripeBankTransferInvoiceResult hydrated = retrieveBankTransferInvoiceForBill(bill);
            applyBankTransferInvoiceDetails(bill, hydrated);
            if (bill.getStripeBankTransferReference() == null || bill.getStripeBankTransferReference().isBlank()) {
                bill.setStripeBankTransferReference(UpnQrPayloadBuilder.toRfReference(hydrated.invoiceNumber()));
            }
            bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);
            bills.save(bill);
            return hydrated;
        }
        StripeBankTransferInvoiceResult invoice = createBankTransferInvoiceForBill(bill, daysUntilDue);
        applyBankTransferInvoiceDetails(bill, invoice);
        bill.setStripeBankTransferReference(UpnQrPayloadBuilder.toRfReference(invoice.invoiceNumber()));
        bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);
        bills.save(bill);
        return invoice;
    }

    public boolean isStripeBankTransfer(PaymentMethod paymentMethod) {
        return paymentMethod != null
                && paymentMethod.isStripeEnabled()
                && paymentMethod.getPaymentType() == PaymentType.BANK_TRANSFER;
    }

    private boolean hasStoredBankTransferDetails(Bill bill) {
        return bill.getStripeCustomerId() != null && !bill.getStripeCustomerId().isBlank()
                && bill.getStripeInvoiceId() != null && !bill.getStripeInvoiceId().isBlank()
                && bill.getStripeHostedInvoiceUrl() != null && !bill.getStripeHostedInvoiceUrl().isBlank()
                && bill.getStripeBankTransferIban() != null && !bill.getStripeBankTransferIban().isBlank()
                && bill.getStripeBankTransferAccountHolderName() != null && !bill.getStripeBankTransferAccountHolderName().isBlank();
    }

    private void applyBankTransferInvoiceDetails(Bill bill, StripeBankTransferInvoiceResult invoice) {
        bill.setStripeCustomerId(invoice.customerId());
        bill.setStripeInvoiceId(invoice.invoiceId());
        bill.setStripeInvoiceNumber(invoice.invoiceNumber());
        bill.setStripeHostedInvoiceUrl(invoice.hostedInvoiceUrl());
        bill.setStripeBankTransferIban(invoice.iban());
        bill.setStripeBankTransferBic(invoice.bic());
        bill.setStripeBankTransferAccountHolderName(invoice.accountHolderName());
        bill.setStripeBankTransferAccountHolderAddressLine1(invoice.accountHolderAddressLine1());
        bill.setStripeBankTransferAccountHolderPostalCode(invoice.accountHolderPostalCode());
        bill.setStripeBankTransferAccountHolderCity(invoice.accountHolderCity());
        bill.setStripeBankTransferAccountHolderCountry(invoice.accountHolderCountry());
    }

    private StripeBankTransferInvoiceResult createBankTransferInvoiceForBill(Bill bill, int daysUntilDue) {
        StripeConnectService.ConnectedAccountRouting routing = stripeConnectRoutingForNewStripePayment(bill);
        if (routing == null) {
            return stripeInvoiceClient.createBankTransferInvoice(bill, daysUntilDue);
        }
        bill.setStripeConnectMode(routing.mode().apiValue());
        bill.setStripeConnectedAccountId(routing.accountId());
        return stripeInvoiceClient.createBankTransferInvoice(
                bill,
                daysUntilDue,
                routing.modeSettings().secretKey(),
                routing.modeSettings().currency(),
                stripeConfig.euBankTransferCountry(),
                routing.accountId()
        );
    }

    private StripeBankTransferInvoiceResult retrieveBankTransferInvoiceForBill(Bill bill) {
        if (bill.getStripeConnectedAccountId() == null || bill.getStripeConnectedAccountId().isBlank()
                || bill.getStripeConnectMode() == null || bill.getStripeConnectMode().isBlank()
                || stripePlatformSettingsService == null) {
            return stripeInvoiceClient.retrieveBankTransferInvoice(bill.getStripeCustomerId(), bill.getStripeInvoiceId());
        }
        StripeConnectMode mode = StripeConnectMode.fromRaw(bill.getStripeConnectMode());
        StripePlatformSettingsService.StripeModeSettings modeSettings = stripePlatformSettingsService.modeSettings(mode);
        return stripeInvoiceClient.retrieveBankTransferInvoice(
                bill.getStripeCustomerId(),
                bill.getStripeInvoiceId(),
                modeSettings.secretKey(),
                modeSettings.currency(),
                stripeConfig.euBankTransferCountry(),
                bill.getStripeConnectedAccountId()
        );
    }

    private StripeConnectService.ConnectedAccountRouting stripeConnectRoutingForNewStripePayment(Bill bill) {
        if (stripeConnectService == null || stripePlatformSettingsService == null || bill.getCompany() == null) {
            return null;
        }
        return stripeConnectService.routingForCompany(bill.getCompany());
    }


    private String billingReturnUrl(Bill bill, String status) {
        return publicBaseUrl()
                + "/api/guest/stripe/billing/return?status=" + url(status == null || status.isBlank() ? "success" : status)
                + "&billId=" + (bill.getId() == null ? "" : bill.getId())
                + "&billNumber=" + url(bill.getBillNumber())
                + "&session_id={CHECKOUT_SESSION_ID}";
    }

    private String billingCancelUrl(Bill bill) {
        return publicBaseUrl()
                + "/api/guest/stripe/billing/cancel?billId=" + (bill.getId() == null ? "" : bill.getId())
                + "&billNumber=" + url(bill.getBillNumber())
                + "&session_id={CHECKOUT_SESSION_ID}";
    }

    private String publicBaseUrl() {
        String value = firstNonBlank(
                environment == null ? null : environment.getProperty("APP_PUBLIC_BASE_URL"),
                environment == null ? null : environment.getProperty("app.public-base-url"),
                environment == null ? null : environment.getProperty("APP_STRIPE_BILLING_PUBLIC_BASE_URL"),
                environment == null ? null : environment.getProperty("app.stripe.billing-public-base-url"),
                environment == null ? null : environment.getProperty("APP_STRIPE_GUEST_PUBLIC_BASE_URL"),
                environment == null ? null : environment.getProperty("app.stripe.guest-public-base-url"),
                environment == null ? null : environment.getProperty("APP_PAYPAL_PUBLIC_BASE_URL"),
                environment == null ? null : environment.getProperty("app.paypal.public-base-url"),
                environment == null ? null : environment.getProperty("APP_AUTH_FRONTEND_URL"),
                environment == null ? null : environment.getProperty("app.auth.frontend-url")
        );
        if (value == null || value.isBlank()) {
            value = "http://localhost:4000";
        }
        value = value.trim();
        while (value.endsWith("/")) {
            value = value.substring(0, value.length() - 1);
        }
        return value;
    }

    private String url(String value) {
        return java.net.URLEncoder.encode(value == null ? "" : value, java.nio.charset.StandardCharsets.UTF_8);
    }

    private void validateBillAmount(Bill bill) {
        if (bill.getTotalGross() == null || bill.getTotalGross().compareTo(BigDecimal.ZERO) <= 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bill total amount must be positive.");
        }
        BigDecimal recomputedGross = bill.getItems().stream()
                .map(i -> i.getGrossPrice() == null ? BigDecimal.ZERO : i.getGrossPrice())
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal persisted = bill.getTotalGross().setScale(2, RoundingMode.HALF_UP);
        if (recomputedGross.compareTo(persisted) != 0) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Bill amount validation failed.");
        }
    }

    private String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) return value.trim();
        }
        return "";
    }

    private String normalizeStatus(String value) {
        if (!BillPaymentStatus.isKnown(value)) return BillPaymentStatus.OPEN;
        return value;
    }
}
