package com.example.app.guest.order;

import com.example.app.billing.*;
import com.example.app.client.Client;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.model.GuestProduct;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Comparator;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

/**
 * Issues and settles {@link Bill} rows for guest Wallet product purchases (packs,
 * memberships, class tickets) that do <strong>not</strong> result in a session
 * booking. Mirrors the invoice flow the tenant web app uses for its own bills so
 * those entries are visible in Billing and can be paid/reconciled with the same
 * tooling.
 */
@Service
public class GuestProductBillingService {
    private static final Logger log = LoggerFactory.getLogger(GuestProductBillingService.class);

    private final BillRepository bills;
    private final PaymentMethodRepository paymentMethods;
    private final TransactionServiceRepository transactionServices;
    private final AppSettingRepository settings;
    private final UserRepository users;
    private final BillingEmailService billingEmailService;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final BillPdfService billPdfService;

    public GuestProductBillingService(
            BillRepository bills,
            PaymentMethodRepository paymentMethods,
            TransactionServiceRepository transactionServices,
            AppSettingRepository settings,
            UserRepository users,
            BillingEmailService billingEmailService,
            InvoicePdfS3Service invoicePdfS3Service,
            BillPdfService billPdfService
    ) {
        this.bills = bills;
        this.paymentMethods = paymentMethods;
        this.transactionServices = transactionServices;
        this.settings = settings;
        this.users = users;
        this.billingEmailService = billingEmailService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.billPdfService = billPdfService;
    }

    /**
     * Creates (or returns the existing) bill for the given wallet order with
     * {@code PAYMENT_PENDING} status. For bank transfers, the bill gets a bank
     * reference and the invoice PDF is emailed to the guest.
     */
    @Transactional
    public Bill issuePendingBill(GuestOrder order, GuestProduct product, String paymentMethodType) {
        if (order.getBillId() != null) {
            Bill existing = bills.findById(order.getBillId()).orElse(null);
            if (existing != null) return existing;
        }

        Long companyId = order.getCompany().getId();
        PaymentMethod paymentMethod = resolvePaymentMethod(companyId, paymentMethodType);
        User consultant = resolveConsultant(companyId);
        TransactionService serviceLine = resolveOrCreateGuestProductService(product, companyId);

        Bill bill = new Bill();
        bill.setCompany(order.getCompany());
        bill.setBillNumber(nextInvoiceNumber(companyId));
        bill.setClient(order.getClient());
        setBillClientSnapshot(bill, order.getClient());
        setBillRecipientPersonSnapshot(bill);
        bill.setConsultant(consultant);
        bill.setPaymentMethod(paymentMethod);
        bill.setIssueDate(LocalDate.now());
        bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);

        BigDecimal gross = order.getTotalGross() == null
                ? (product.getPriceGross() == null ? BigDecimal.ZERO : product.getPriceGross())
                : order.getTotalGross();
        gross = gross.setScale(2, RoundingMode.HALF_UP);
        BigDecimal net = gross;

        BillItem item = new BillItem();
        item.setBill(bill);
        item.setTransactionService(serviceLine);
        item.setQuantity(1);
        item.setNetPrice(net);
        item.setGrossPrice(gross);
        bill.getItems().add(item);
        bill.setTotalNet(net);
        bill.setTotalGross(gross);

        if ("BANK_TRANSFER".equalsIgnoreCase(paymentMethodType)) {
            bill.setBankTransferReference(BankStatementReconciliationService.bankReferenceForBill(bill));
        }

        Bill saved = bills.saveAndFlush(bill);

        order.setBillId(saved.getId());

        if ("BANK_TRANSFER".equalsIgnoreCase(paymentMethodType)) {
            try {
                byte[] pdf = billPdfService.generatePdf(saved, companyId);
                invoicePdfS3Service.uploadAndPersistKey(saved, pdf);
                billingEmailService.sendBankTransferFolio(saved, pdf);
            } catch (Exception ex) {
                log.warn("Failed to archive/email wallet bank transfer invoice for guest order {} and bill {}",
                        order.getId(), saved.getId(), ex);
            }
        }

        return saved;
    }

    /** Flips a previously-issued wallet bill to {@code PAID} at the given time. Idempotent. */
    @Transactional
    public Bill markBillPaid(Bill bill, OffsetDateTime paidAt) {
        if (BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            return bill;
        }
        bill.setPaymentStatus(BillPaymentStatus.PAID);
        bill.setPaidAt(paidAt == null ? OffsetDateTime.now() : paidAt);
        Bill saved = bills.save(bill);
        try {
            byte[] pdf = invoicePdfS3Service.downloadIfPresent(saved);
            if (pdf == null) {
                pdf = billPdfService.generatePdf(saved, saved.getCompany().getId());
                invoicePdfS3Service.uploadAndPersistKey(saved, pdf);
            }
            billingEmailService.sendPaidBillReceipt(saved, pdf);
        } catch (Exception ex) {
            log.warn("Failed to send paid receipt for wallet bill {}", saved.getId(), ex);
        }
        return saved;
    }

    private PaymentMethod resolvePaymentMethod(Long companyId, String paymentMethodType) {
        List<PaymentMethod> all = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyId);
        PaymentType desired = switch (paymentMethodType == null ? "" : paymentMethodType.toUpperCase(java.util.Locale.ROOT)) {
            case "BANK_TRANSFER" -> PaymentType.BANK_TRANSFER;
            // PayPal has no dedicated PaymentType, so we bucket it with CARD for fiscal/PDF purposes.
            case "CARD", "PAYPAL" -> PaymentType.CARD;
            default -> PaymentType.CARD;
        };
        return all.stream()
                .filter(pm -> pm.getPaymentType() == desired)
                .filter(PaymentMethod::isGuestEnabled)
                .findFirst()
                .or(() -> all.stream().filter(pm -> pm.getPaymentType() == desired).findFirst())
                .or(() -> all.stream().findFirst())
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "No payment method is configured for this company."));
    }

    private User resolveConsultant(Long companyId) {
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .min(Comparator.comparing(User::getId))
                .or(() -> users.findAllByCompanyId(companyId).stream().min(Comparator.comparing(User::getId)))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Tenancy has no users available to issue the invoice against."));
    }

    /**
     * Looks up or creates a catalog {@link TransactionService} mirroring the guest
     * product, so a {@link BillItem} can point at a real (non-null) transaction
     * service without polluting billing admin with one-off rows.
     */
    private TransactionService resolveOrCreateGuestProductService(GuestProduct product, Long companyId) {
        String code = "GP-" + product.getId();
        return transactionServices.findAllByCompanyId(companyId).stream()
                .filter(tx -> code.equals(tx.getCode()))
                .findFirst()
                .orElseGet(() -> {
                    TransactionService tx = new TransactionService();
                    tx.setCompany(product.getCompany());
                    tx.setCode(code);
                    tx.setDescription(product.getName() == null ? "Guest app product" : product.getName());
                    tx.setTaxRate(TaxRate.VAT_0);
                    tx.setNetPrice(product.getPriceGross() == null ? BigDecimal.ZERO : product.getPriceGross());
                    return transactionServices.save(tx);
                });
    }

    private String nextInvoiceNumber(Long companyId) {
        AppSetting setting = settings.findByCompanyIdAndKey(companyId, SettingKey.INVOICE_COUNTER)
                .orElseThrow(() -> new IllegalStateException("Missing setting: INVOICE_COUNTER"));
        String current = setting.getValue();
        setting.setValue(incrementAlphaNumeric(current));
        settings.save(setting);
        return current;
    }

    private static String incrementAlphaNumeric(String value) {
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
}
