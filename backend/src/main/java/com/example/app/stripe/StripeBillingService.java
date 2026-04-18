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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class StripeBillingService {
    private final BillRepository bills;
    private final StripeCheckoutClient stripeCheckoutClient;
    private final StripeInvoiceClient stripeInvoiceClient;
    private final StripeConfig stripeConfig;

    public StripeBillingService(BillRepository bills, StripeCheckoutClient stripeCheckoutClient, StripeInvoiceClient stripeInvoiceClient, StripeConfig stripeConfig) {
        this.bills = bills;
        this.stripeCheckoutClient = stripeCheckoutClient;
        this.stripeInvoiceClient = stripeInvoiceClient;
        this.stripeConfig = stripeConfig;
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
        metadata.put("bill_id", String.valueOf(bill.getId()));
        metadata.put("client_id", bill.getClient() == null ? "" : String.valueOf(bill.getClient().getId()));
        metadata.put("session_id", bill.getSourceSessionIdSnapshot() == null ? "" : String.valueOf(bill.getSourceSessionIdSnapshot()));
        var session = stripeCheckoutClient.createOneTimeSession(
                bill.getBillNumber(),
                bill.getTotalGross(),
                stripeConfig.currency(),
                bill.getClient() == null ? null : bill.getClient().getEmail(),
                metadata
        );
        bill.setCheckoutSessionId(session.id());
        bill.setCheckoutSessionExpiresAt(session.expiresAt());
        bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);
        bills.save(bill);
        return session;
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
            StripeBankTransferInvoiceResult hydrated = stripeInvoiceClient.retrieveBankTransferInvoice(bill.getStripeCustomerId(), bill.getStripeInvoiceId());
            applyBankTransferInvoiceDetails(bill, hydrated);
            if (bill.getStripeBankTransferReference() == null || bill.getStripeBankTransferReference().isBlank()) {
                bill.setStripeBankTransferReference(UpnQrPayloadBuilder.toRfReference(hydrated.invoiceNumber()));
            }
            bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);
            bills.save(bill);
            return hydrated;
        }
        StripeBankTransferInvoiceResult invoice = stripeInvoiceClient.createBankTransferInvoice(bill, daysUntilDue);
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

    private String normalizeStatus(String value) {
        if (!BillPaymentStatus.isKnown(value)) return BillPaymentStatus.OPEN;
        return value;
    }
}
