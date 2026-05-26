package com.example.app.guest.order;

import com.example.app.billing.*;
import com.example.app.client.Client;
import com.example.app.guest.common.GuestInvoiceSettingsSupport;
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
import java.util.Locale;
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
    private final BillFolioPdfService billFolioPdfService;
    private final InvoiceOrderIdService invoiceOrderIdService;

    public GuestProductBillingService(
            BillRepository bills,
            PaymentMethodRepository paymentMethods,
            TransactionServiceRepository transactionServices,
            AppSettingRepository settings,
            UserRepository users,
            BillingEmailService billingEmailService,
            InvoicePdfS3Service invoicePdfS3Service,
            BillFolioPdfService billFolioPdfService,
            InvoiceOrderIdService invoiceOrderIdService
    ) {
        this.bills = bills;
        this.paymentMethods = paymentMethods;
        this.transactionServices = transactionServices;
        this.settings = settings;
        this.users = users;
        this.billingEmailService = billingEmailService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.billFolioPdfService = billFolioPdfService;
        this.invoiceOrderIdService = invoiceOrderIdService;
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
            if (existing != null) {
                invoiceOrderIdService.assignIfMissing(existing);
                return bills.save(existing);
            }
        }

        Long companyId = order.getCompany().getId();
        PaymentMethod paymentMethod = resolvePaymentMethod(companyId, paymentMethodType);
        User consultant = resolveConsultant(companyId);
        TransactionService serviceLine = resolveWalletTransactionService(product, companyId);

        Bill bill = new Bill();
        bill.setCompany(order.getCompany());
        bill.setBillNumber(nextInvoiceNumber(companyId));
        bill.setClient(order.getClient());
        setBillClientSnapshot(bill, order.getClient());
        GuestInvoiceSettingsSupport.applyBillRecipientSnapshot(bill, order.getClient());
        bill.setConsultant(consultant);
        bill.setPaymentMethod(paymentMethod);
        bill.setIssueDate(LocalDate.now());
        bill.setPaymentStatus(BillPaymentStatus.PAYMENT_PENDING);

        int quantity = product.getUsageLimit() != null && product.getUsageLimit() > 0 ? product.getUsageLimit() : 1;
        BigDecimal totalGross = order.getTotalGross() != null ? order.getTotalGross() : product.getPriceGross();
        if (totalGross == null) totalGross = BigDecimal.ZERO;
        totalGross = totalGross.setScale(2, RoundingMode.HALF_UP);

        BigDecimal unitGross = totalGross.divide(BigDecimal.valueOf(quantity), 2, RoundingMode.HALF_UP);
        BigDecimal multiplier = serviceLine.getTaxRate() != null && serviceLine.getTaxRate().multiplier != null
                ? serviceLine.getTaxRate().multiplier
                : BigDecimal.ZERO;
        BigDecimal unitNet = unitGross.divide(BigDecimal.ONE.add(multiplier), 2, RoundingMode.HALF_UP);
        BigDecimal totalNet = unitNet.multiply(BigDecimal.valueOf(quantity)).setScale(2, RoundingMode.HALF_UP);

        BillItem item = new BillItem();
        item.setBill(bill);
        item.setTransactionService(serviceLine);
        item.setQuantity(quantity);
        item.setNetPrice(unitNet);
        item.setGrossPrice(totalGross);
        bill.getItems().add(item);
        bill.setTotalNet(totalNet);
        bill.setTotalGross(totalGross);

        if ("BANK_TRANSFER".equalsIgnoreCase(paymentMethodType)) {
            bill.setBankTransferReference(BankStatementReconciliationService.bankReferenceForBill(bill));
        }
        invoiceOrderIdService.assignIfMissing(bill);

        Bill saved = bills.saveAndFlush(bill);

        order.setBillId(saved.getId());

        if ("BANK_TRANSFER".equalsIgnoreCase(paymentMethodType)) {
            try {
                byte[] pdf = billFolioPdfService.generate(saved, companyId);
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
                pdf = billFolioPdfService.generate(saved, saved.getCompany().getId());
                invoicePdfS3Service.uploadAndPersistKey(saved, pdf);
            }
            billingEmailService.sendPaidBillReceipt(saved, pdf);
        } catch (Exception ex) {
            log.warn("Failed to send paid receipt for wallet bill {}", saved.getId(), ex);
        }
        return saved;
    }


    /** Marks a wallet-product bill as cancelled when the external checkout is cancelled/expired before payment. */
    @Transactional
    public void markBillCancelled(Long billId) {
        if (billId == null) return;
        Bill bill = bills.findById(billId).orElse(null);
        if (bill == null || BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
            return;
        }
        bill.setPaymentStatus(BillPaymentStatus.CANCELLED);
        bills.save(bill);
    }

    private PaymentMethod resolvePaymentMethod(Long companyId, String paymentMethodType) {
        List<PaymentMethod> all = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyId);
        String normalized = paymentMethodType == null ? "" : paymentMethodType.trim().toUpperCase(Locale.ROOT);
        if ("BANK_TRANSFER".equals(normalized)) {
            return all.stream()
                    .filter(pm -> pm.getPaymentType() == PaymentType.BANK_TRANSFER)
                    .filter(this::isExternallyEnabled)
                    .findFirst()
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "Bank transfer is not enabled for this company."));
        }
        if ("PAYPAL".equals(normalized) || "OTHER".equals(normalized)) {
            return all.stream()
                    .filter(pm -> pm.getPaymentType() == PaymentType.OTHER)
                    .filter(this::isExternallyEnabled)
                    .filter(this::isPaypalNamedMethod)
                    .findFirst()
                    .or(() -> all.stream()
                            .filter(pm -> pm.getPaymentType() == PaymentType.OTHER)
                            .filter(this::isExternallyEnabled)
                            .findFirst())
                    .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                            "PayPal is not enabled for this company."));
        }
        return all.stream()
                .filter(pm -> pm.getPaymentType() == PaymentType.CARD)
                .filter(this::isExternallyEnabled)
                .filter(PaymentMethod::isStripeEnabled)
                .findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Card payments are not enabled for this company."));
    }

    private boolean isExternallyEnabled(PaymentMethod method) {
        return method.isGuestEnabled() || method.isWidgetEnabled();
    }

    private User resolveConsultant(Long companyId) {
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .min(Comparator.comparing(User::getId))
                .or(() -> users.findAllByCompanyId(companyId).stream().min(Comparator.comparing(User::getId)))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Tenancy has no users available to issue the invoice against."));
    }

    private TransactionService resolveWalletTransactionService(GuestProduct product, Long companyId) {
        if (product.getTransactionService() != null) {
            return product.getTransactionService();
        }
        if (product.getSessionType() != null
                && product.getSessionType().getLinkedServices() != null
                && !product.getSessionType().getLinkedServices().isEmpty()) {
            TransactionService linked = product.getSessionType().getLinkedServices().stream()
                    .map(link -> link.getTransactionService())
                    .filter(tx -> tx != null)
                    .findFirst()
                    .orElse(null);
            if (linked != null) return linked;
        }
        return resolveOrCreateGuestProductService(product, companyId);
    }

    /** Falls back when no linked transaction services are configured on product session type. */
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

    private boolean isPaypalNamedMethod(PaymentMethod method) {
        if (method == null || method.getName() == null) return false;
        return "paypal".equalsIgnoreCase(method.getName().trim());
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

}
