package com.example.app.stripe;

import com.example.app.billing.Bill;
import com.example.app.billing.BillPaymentStatus;
import com.example.app.billing.BillPdfService;
import com.example.app.billing.BillRepository;
import com.example.app.billing.BillingEmailService;
import com.example.app.billing.InvoicePdfS3Service;
import com.example.app.fiscal.FiscalizationService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.OffsetDateTime;
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
    private final BillPdfService billPdfService;
    private final BillingEmailService billingEmailService;
    private final InvoicePdfS3Service invoicePdfS3Service;

    public StripeWebhookService(
            StripeConfig config,
            StripeWebhookVerifier verifier,
            StripeWebhookEventRepository events,
            BillRepository bills,
            FiscalizationService fiscalizationService,
            BillPdfService billPdfService,
            BillingEmailService billingEmailService,
            InvoicePdfS3Service invoicePdfS3Service
    ) {
        this.config = config;
        this.verifier = verifier;
        this.events = events;
        this.bills = bills;
        this.fiscalizationService = fiscalizationService;
        this.billPdfService = billPdfService;
        this.billingEmailService = billingEmailService;
        this.invoicePdfS3Service = invoicePdfS3Service;
    }

    @Transactional
    public void handleWebhook(String payload, String signatureHeader) {
        if (!verifier.isValid(payload, signatureHeader, config.webhookSecret())) {
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

    private void handleCheckoutCompleted(JsonNode eventNode) {
        JsonNode object = eventNode.path("data").path("object");
        String checkoutSessionId = object.path("id").asText("");
        String paymentIntentId = object.path("payment_intent").asText("");
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
    }

    private void handleCheckoutExpiredOrFailed(JsonNode eventNode) {
        JsonNode object = eventNode.path("data").path("object");
        String checkoutSessionId = object.path("id").asText("");
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

    private void finalizeBillPayment(Bill bill) {
        bills.save(bill);
        Bill fiscalized = bill;
        if (bill.getFiscalStatus() == null
                || bill.getFiscalStatus() == com.example.app.billing.BillFiscalStatus.NOT_SENT
                || bill.getFiscalStatus() == com.example.app.billing.BillFiscalStatus.PENDING
                || bill.getFiscalStatus() == com.example.app.billing.BillFiscalStatus.FAILED) {
            fiscalized = fiscalizationService.fiscalizeBill(bill, bill.getCompany().getId());
        }
        byte[] pdf = billPdfService.generatePdf(fiscalized, fiscalized.getCompany().getId());
        invoicePdfS3Service.uploadAndPersistKey(fiscalized, pdf);
        billingEmailService.sendPaidBillReceipt(fiscalized, pdf);
    }

    private Long parseLong(String value, String label) {
        try {
            return Long.parseLong(value);
        } catch (Exception ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid " + label + " value.");
        }
    }
}
