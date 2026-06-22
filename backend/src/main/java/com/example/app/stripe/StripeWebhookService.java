package com.example.app.stripe;

import com.example.app.billing.Bill;
import com.example.app.billing.BillFolioPdfService;
import com.example.app.billing.BillPaymentStatus;
import com.example.app.billing.BillRepository;
import com.example.app.billing.BillingEmailService;
import com.example.app.billing.InvoicePdfS3Service;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.guest.order.GuestOrderService;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
import org.springframework.beans.factory.annotation.Autowired;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StripeWebhookService {
    private static final Logger log = LoggerFactory.getLogger(StripeWebhookService.class);
    private static final ObjectMapper JSON = new ObjectMapper();

    private final StripeConfig config;
    private final StripeWebhookVerifier verifier;
    private final StripeWebhookEventRepository events;
    private final BillRepository bills;
    private final FiscalizationService fiscalizationService;
    private final BillFolioPdfService billFolioPdfService;
    private final BillingEmailService billingEmailService;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final StripeCheckoutClient checkoutClient;
    private final StripePlatformSettingsService platformSettings;
    private final StripeConnectService connectService;
    private final GuestOrderService guestOrderService;
    private final AppSettingRepository appSettings;

    @Autowired
    public StripeWebhookService(
            StripeConfig config,
            StripeWebhookVerifier verifier,
            StripeWebhookEventRepository events,
            BillRepository bills,
            FiscalizationService fiscalizationService,
            BillFolioPdfService billFolioPdfService,
            BillingEmailService billingEmailService,
            InvoicePdfS3Service invoicePdfS3Service,
            StripeCheckoutClient checkoutClient,
            StripePlatformSettingsService platformSettings,
            StripeConnectService connectService,
            GuestOrderService guestOrderService,
            AppSettingRepository appSettings
    ) {
        this.config = config;
        this.verifier = verifier;
        this.events = events;
        this.bills = bills;
        this.fiscalizationService = fiscalizationService;
        this.billFolioPdfService = billFolioPdfService;
        this.billingEmailService = billingEmailService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.checkoutClient = checkoutClient;
        this.platformSettings = platformSettings;
        this.connectService = connectService;
        this.guestOrderService = guestOrderService;
        this.appSettings = appSettings;
    }

    /** Backwards-compatible constructor for older unit tests. */
    StripeWebhookService(
            StripeConfig config,
            StripeWebhookVerifier verifier,
            StripeWebhookEventRepository events,
            BillRepository bills,
            FiscalizationService fiscalizationService,
            BillFolioPdfService billFolioPdfService,
            BillingEmailService billingEmailService,
            InvoicePdfS3Service invoicePdfS3Service
    ) {
        this(config, verifier, events, bills, fiscalizationService, billFolioPdfService, billingEmailService, invoicePdfS3Service, null, null, null, null, null);
    }

    @Transactional
    public void handleWebhook(String payload, String signatureHeader) {
        if (!isValidSignature(payload, signatureHeader)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Stripe signature.");
        }
        JsonNode eventNode;
        try {
            eventNode = JSON.readTree(payload);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid Stripe payload.");
        }
        String eventId = eventNode.path("id").asText("");
        String eventType = eventNode.path("type").asText("");
        if (eventId.isBlank() || eventType.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Missing Stripe event id/type.");
        }
        if (events.existsByEventId(eventId)) {
            log.info("Stripe webhook duplicate received eventId={} type={}", eventId, eventType);
            return;
        }
        StripeWebhookEvent event = new StripeWebhookEvent();
        event.setEventId(eventId);
        event.setEventType(eventType);
        event.setProcessingStatus("received");
        event.setPayload(payload);
        try {
            events.save(event);
        } catch (DataIntegrityViolationException ex) {
            log.info("Stripe webhook duplicate race resolved eventId={}", eventId);
            return;
        }

        try {
            if ("checkout.session.completed".equals(eventType)) {
                handleCheckoutCompleted(eventNode);
            } else if ("checkout.session.expired".equals(eventType) || "checkout.session.async_payment_failed".equals(eventType)) {
                handleCheckoutExpiredOrFailed(eventNode);
            } else if ("invoice.paid".equals(eventType)) {
                handleInvoicePaid(eventNode);
            } else if ("account.updated".equals(eventType)) {
                handleAccountUpdated(eventNode);
            } else if ("account.application.deauthorized".equals(eventType)) {
                handleAccountApplicationDeauthorized(eventNode);
            } else {
                log.info("Stripe webhook ignored type={}", eventType);
            }
            event.setProcessingStatus("processed");
            event.setErrorMessage(null);
            events.save(event);
        } catch (Exception ex) {
            event.setProcessingStatus("failed");
            event.setErrorMessage(ex.getMessage());
            events.save(event);
            log.error("Stripe webhook processing failed eventId={} type={}", eventId, eventType, ex);
            throw ex;
        }
    }

    @Transactional
    public BillCheckoutReconcileResult reconcileBillCheckoutReturn(String billIdRaw, String checkoutSessionId) {
        if (billIdRaw == null || billIdRaw.isBlank()) {
            return new BillCheckoutReconcileResult(false, false, "missing_bill_id", "", "Missing bill id.");
        }
        if (checkoutSessionId == null || checkoutSessionId.isBlank()) {
            return new BillCheckoutReconcileResult(false, false, "missing_session_id", "", "Missing Stripe checkout session id.");
        }
        Long billId = parseLong(billIdRaw, "billId");
        Bill bill = bills.findById(billId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill not found for Stripe checkout return."));
        if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            return new BillCheckoutReconcileResult(true, true, "already_paid", "paid", "Bill was already marked as paid.");
        }
        String expectedSessionId = bill.getCheckoutSessionId() == null ? "" : bill.getCheckoutSessionId().trim();
        String returnedSessionId = checkoutSessionId.trim();
        if (!expectedSessionId.isBlank() && !expectedSessionId.equals(returnedSessionId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Stripe session does not match current bill checkout session.");
        }
        if (checkoutClient == null) {
            return new BillCheckoutReconcileResult(false, false, "client_unavailable", "", "Stripe checkout client is not available.");
        }

        StripeCheckoutClient.StripeCheckoutSessionDetails session = checkoutClient.retrieveSession(
                secretKeyForBill(bill),
                returnedSessionId,
                connectedAccountForBill(bill)
        );
        if (!returnedSessionId.equals(session.id())) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Stripe returned a different checkout session.");
        }

        String stripePaymentStatus = session.paymentStatus() == null ? "" : session.paymentStatus().trim().toLowerCase();
        String stripeSessionStatus = session.status() == null ? "" : session.status().trim().toLowerCase();
        if (!"paid".equals(stripePaymentStatus)) {
            return new BillCheckoutReconcileResult(false, false, stripeSessionStatus.isBlank() ? "processing" : stripeSessionStatus, stripePaymentStatus, "Stripe payment is not paid yet.");
        }

        bill.setPaymentStatus(BillPaymentStatus.PAID);
        if (session.paymentIntentId() != null && !session.paymentIntentId().isBlank()) {
            bill.setPaymentIntentId(session.paymentIntentId());
        }
        bill.setPaidAt(OffsetDateTime.now());
        finalizeBillPayment(bill);
        markPlatformSubscriptionPaidIfApplicable(bill);
        return new BillCheckoutReconcileResult(true, false, stripeSessionStatus, stripePaymentStatus, "Bill marked as paid from Stripe checkout return.");
    }

    private void handleCheckoutCompleted(JsonNode eventNode) {
        JsonNode object = eventNode.path("data").path("object");
        String checkoutSessionId = object.path("id").asText("");
        String paymentIntentId = object.path("payment_intent").asText("");
        String guestOrderIdRaw = object.path("metadata").path("guest_order_id").asText("");
        if (!guestOrderIdRaw.isBlank()) {
            if (guestOrderService == null) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Guest Stripe checkout is not available.");
            }
            String customerId = object.path("customer").asText("");
            guestOrderService.onStripeCheckoutCompleted(parseLong(guestOrderIdRaw, "metadata.guest_order_id"), checkoutSessionId, paymentIntentId, customerId);
            return;
        }
        String billIdRaw = object.path("metadata").path("bill_id").asText("");
        if (billIdRaw.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "checkout.session.completed missing metadata.bill_id");
        }
        Long billId = parseLong(billIdRaw, "metadata.bill_id");
        Bill bill = bills.findById(billId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill not found for Stripe event."));
        if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            log.info("Stripe payment already applied billId={} checkoutSessionId={}", billId, checkoutSessionId);
            return;
        }
        if (bill.getCheckoutSessionId() != null && !bill.getCheckoutSessionId().isBlank()
                && checkoutSessionId != null && !checkoutSessionId.isBlank()
                && !bill.getCheckoutSessionId().equals(checkoutSessionId)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Stripe session does not match current bill checkout session.");
        }
        bill.setPaymentStatus(BillPaymentStatus.PAID);
        bill.setPaymentIntentId(paymentIntentId.isBlank() ? bill.getPaymentIntentId() : paymentIntentId);
        bill.setPaidAt(OffsetDateTime.now());
        finalizeBillPayment(bill);
        markPlatformSubscriptionPaidIfApplicable(bill);
    }

    private void markPlatformSubscriptionPaidIfApplicable(Bill bill) {
        if (bill == null || appSettings == null) {
            return;
        }
        String reference = bill.getBankTransferReference();
        String prefix = "CALENDRA-SUBSCRIPTION:";
        if (reference == null || !reference.startsWith(prefix)) {
            return;
        }
        try {
            Long tenantId = Long.parseLong(reference.substring(prefix.length()).trim());
            appSettings.findByCompanyIdAndKey(tenantId, SettingKey.BILLING_SUBSCRIPTION_STATUS).ifPresent(setting -> {
                setting.setValue("PAID");
                appSettings.save(setting);
            });
        } catch (Exception ignored) {
            // Keep the bill paid even if the subscription-status marker cannot be updated.
        }
    }

    private void handleInvoicePaid(JsonNode eventNode) {
        JsonNode object = eventNode.path("data").path("object");
        String stripeInvoiceId = object.path("id").asText("");
        String hostedInvoiceUrl = object.path("hosted_invoice_url").asText("");
        String stripeInvoiceNumber = object.path("number").asText("");
        String billIdRaw = object.path("metadata").path("bill_id").asText("");

        Bill bill = null;
        if (!billIdRaw.isBlank()) {
            Long billId = parseLong(billIdRaw, "metadata.bill_id");
            bill = bills.findById(billId).orElse(null);
        }
        if (bill == null && stripeInvoiceId != null && !stripeInvoiceId.isBlank()) {
            bill = bills.findByStripeInvoiceId(stripeInvoiceId).orElse(null);
        }
        if (bill == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill not found for Stripe invoice event.");
        }
        if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            log.info("Stripe invoice payment already applied billId={} stripeInvoiceId={}", bill.getId(), stripeInvoiceId);
            return;
        }
        if (stripeInvoiceId != null && !stripeInvoiceId.isBlank()) {
            bill.setStripeInvoiceId(stripeInvoiceId);
        }
        if (hostedInvoiceUrl != null && !hostedInvoiceUrl.isBlank()) {
            bill.setStripeHostedInvoiceUrl(hostedInvoiceUrl);
        }
        if (stripeInvoiceNumber != null && !stripeInvoiceNumber.isBlank()) {
            bill.setStripeInvoiceNumber(stripeInvoiceNumber);
        }
        bill.setPaymentStatus(BillPaymentStatus.PAID);
        bill.setPaidAt(OffsetDateTime.now());
        finalizeBillPayment(bill);
        markPlatformSubscriptionPaidIfApplicable(bill);
    }

    private void handleCheckoutExpiredOrFailed(JsonNode eventNode) {
        JsonNode object = eventNode.path("data").path("object");
        String checkoutSessionId = object.path("id").asText("");
        String guestOrderIdRaw = object.path("metadata").path("guest_order_id").asText("");
        if (!guestOrderIdRaw.isBlank()) {
            if (guestOrderService != null) {
                guestOrderService.onStripeCheckoutExpiredOrFailed(parseLong(guestOrderIdRaw, "metadata.guest_order_id"), checkoutSessionId);
            }
            return;
        }
        String billIdRaw = object.path("metadata").path("bill_id").asText("");
        if (billIdRaw.isBlank()) {
            log.warn("Stripe expired/failed event missing metadata.bill_id; session={}", checkoutSessionId);
            return;
        }
        Long billId = parseLong(billIdRaw, "metadata.bill_id");
        Bill bill = bills.findById(billId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Bill not found for Stripe event."));
        if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            return;
        }
        if (bill.getCheckoutSessionId() != null && !bill.getCheckoutSessionId().isBlank()
                && checkoutSessionId != null && !checkoutSessionId.isBlank()
                && !bill.getCheckoutSessionId().equals(checkoutSessionId)) {
            return;
        }
        bill.setPaymentStatus(BillPaymentStatus.CANCELLED);
        bills.save(bill);
    }

    private void handleAccountUpdated(JsonNode eventNode) {
        if (connectService == null) return;
        JsonNode accountNode = eventNode.path("data").path("object");
        String accountId = firstNonBlank(eventNode.path("account").asText(""), accountNode.path("id").asText(""));
        connectService.handleAccountUpdated(accountId, accountNode);
    }

    private void handleAccountApplicationDeauthorized(JsonNode eventNode) {
        if (connectService == null) return;
        String accountId = firstNonBlank(eventNode.path("account").asText(""), eventNode.path("data").path("object").path("id").asText(""));
        if (accountId.isBlank()) {
            log.warn("Stripe connected account deauthorized event did not include an account id.");
            return;
        }
        connectService.handleAccountApplicationDeauthorized(accountId);
    }

    private String secretKeyForBill(Bill bill) {
        if (bill != null
                && bill.getStripeConnectMode() != null
                && !bill.getStripeConnectMode().isBlank()
                && platformSettings != null) {
            StripeConnectMode mode = StripeConnectMode.fromRaw(bill.getStripeConnectMode());
            String key = platformSettings.modeSettings(mode).secretKey();
            if (key != null && !key.isBlank()) {
                return key.trim();
            }
        }
        return config.secretKey();
    }

    private String connectedAccountForBill(Bill bill) {
        if (bill == null || bill.getStripeConnectedAccountId() == null) return "";
        return bill.getStripeConnectedAccountId().trim();
    }

    private boolean isValidSignature(String payload, String signatureHeader) {
        long toleranceSeconds = config.webhookToleranceSeconds();
        if (verifier.isValid(payload, signatureHeader, config.webhookSecret(), toleranceSeconds)) return true;
        if (platformSettings != null) {
            for (String secret : platformSettings.webhookSecrets()) {
                if (verifier.isValid(payload, signatureHeader, secret, toleranceSeconds)) return true;
            }
        }
        return false;
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.trim().isBlank()) return value.trim();
        }
        return "";
    }

    private void finalizeBillPayment(Bill bill) {
        bills.save(bill);
        Bill fiscalized = bill;
        if (bill.getFiscalStatus() == null
                || bill.getFiscalStatus() == com.example.app.billing.BillFiscalStatus.NOT_SENT
                || bill.getFiscalStatus() == com.example.app.billing.BillFiscalStatus.PENDING
                || bill.getFiscalStatus() == com.example.app.billing.BillFiscalStatus.FAILED) {
            fiscalized = fiscalizationService.fiscalizeBill(bill, bill.getCompany().getId());
        }
        byte[] pdf = billFolioPdfService.generate(fiscalized, fiscalized.getCompany().getId());
        invoicePdfS3Service.uploadAndPersistKey(fiscalized, pdf);
        billingEmailService.sendPaidBillReceipt(fiscalized, pdf);
        if (guestOrderService != null) {
            guestOrderService.onWalletBillPaid(fiscalized.getId());
        }
    }

    private Long parseLong(String value, String label) {
        try {
            return Long.parseLong(value);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + label + " value.");
        }
    }

    public record BillCheckoutReconcileResult(
            boolean paid,
            boolean alreadyPaid,
            String status,
            String paymentStatus,
            String message
    ) {}
}
