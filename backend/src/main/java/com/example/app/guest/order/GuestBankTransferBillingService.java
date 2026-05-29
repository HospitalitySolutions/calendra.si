package com.example.app.guest.order;

import com.example.app.billing.*;
import com.example.app.client.Client;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.guest.model.GuestPaymentMethodType;
import com.example.app.guest.model.GuestOrder;
import com.example.app.guest.common.GuestInvoiceSettingsSupport;
import com.example.app.session.SessionBooking;
import com.example.app.session.TypeTransactionService;
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

@Service
public class GuestBankTransferBillingService {
    private static final Logger log = LoggerFactory.getLogger(GuestBankTransferBillingService.class);

    private final BillRepository bills;
    private final PaymentMethodRepository paymentMethods;
    private final AppSettingRepository settings;
    private final FiscalizationService fiscalizationService;
    private final BillingEmailService billingEmailService;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final BillFolioPdfService billFolioPdfService;
    private final InvoiceOrderIdService invoiceOrderIdService;
    private final UserRepository users;

    public GuestBankTransferBillingService(
            BillRepository bills,
            PaymentMethodRepository paymentMethods,
            AppSettingRepository settings,
            FiscalizationService fiscalizationService,
            BillingEmailService billingEmailService,
            InvoicePdfS3Service invoicePdfS3Service,
            BillFolioPdfService billFolioPdfService,
            InvoiceOrderIdService invoiceOrderIdService,
            UserRepository users
    ) {
        this.bills = bills;
        this.paymentMethods = paymentMethods;
        this.settings = settings;
        this.fiscalizationService = fiscalizationService;
        this.billingEmailService = billingEmailService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.billFolioPdfService = billFolioPdfService;
        this.invoiceOrderIdService = invoiceOrderIdService;
        this.users = users;
    }

    @Transactional
    public Bill issueConfirmedBookingBill(GuestOrder order, SessionBooking booking) {
        return issueAdvanceBill(order, booking, GuestPaymentMethodType.BANK_TRANSFER.name(), BillPaymentStatus.PAYMENT_PENDING, null);
    }

    @Transactional
    public Bill issuePaidAdvanceBill(GuestOrder order, SessionBooking booking, String paymentMethodType) {
        return issueAdvanceBill(order, booking, paymentMethodType, BillPaymentStatus.PAID, OffsetDateTime.now());
    }

    private Bill issueAdvanceBill(GuestOrder order, SessionBooking booking, String paymentMethodType, String targetPaymentStatus, OffsetDateTime paidAt) {
        if (booking == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Booking is required for advance billing.");
        }
        Long companyId = order.getCompany().getId();
        Bill existing = bills.findFirstByCompanyIdAndSourceSessionIdSnapshotAndBillTypeOrderByIdDesc(companyId, booking.getId(), BillType.ADVANCE)
                .orElse(null);
        if (existing != null) {
            return finalizeExistingAdvance(existing, targetPaymentStatus, paidAt, order);
        }

        PaymentMethod paymentMethod = resolvePaymentMethod(companyId, paymentMethodType);
        Bill bill = new Bill();
        bill.setCompany(order.getCompany());
        bill.setBillNumber(nextInvoiceNumber(companyId));
        bill.setBillType(BillType.ADVANCE);
        bill.setClient(order.getClient());
        setBillClientSnapshot(bill, order.getClient());
        GuestInvoiceSettingsSupport.applyBillRecipientSnapshot(bill, order.getClient());
        bill.setConsultant(resolveBillConsultant(companyId, booking));
        bill.setPaymentMethod(paymentMethod);
        bill.setIssueDate(LocalDate.now());
        bill.setSourceSessionIdSnapshot(booking.getId());
        bill.setInvoiceLocale(resolveInvoiceLocale(order));
        bill.setPaymentStatus(targetPaymentStatus);
        if (BillPaymentStatus.PAID.equals(targetPaymentStatus)) {
            bill.setPaidAt(paidAt == null ? OffsetDateTime.now() : paidAt);
        }
        if (isBankTransferPayment(paymentMethod)) {
            bill.setBankTransferReference(BankStatementReconciliationService.bankReferenceForBill(bill));
        }

        if (booking.getType() == null || booking.getType().getLinkedServices() == null || booking.getType().getLinkedServices().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The booked service has no linked billing services, so an advance invoice cannot be generated.");
        }

        BigDecimal totalNet = BigDecimal.ZERO;
        BigDecimal totalGross = BigDecimal.ZERO;
        for (TypeTransactionService link : booking.getType().getLinkedServices()) {
            TransactionService tx = link.getTransactionService();
            if (tx == null) {
                continue;
            }
            BillItem item = new BillItem();
            item.setBill(bill);
            item.setTransactionService(tx);
            item.setQuantity(1);
            BigDecimal net = link.getPrice() != null ? link.getPrice() : tx.getNetPrice();
            item.setNetPrice(net);
            BigDecimal gross = net.add(net.multiply(tx.getTaxRate().multiplier)).setScale(2, RoundingMode.HALF_UP);
            item.setGrossPrice(gross);
            totalNet = totalNet.add(net);
            totalGross = totalGross.add(gross);
            bill.getItems().add(item);
        }
        if (bill.getItems().isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "The booked service has no valid billing lines, so an advance invoice cannot be generated.");
        }
        bill.setTotalNet(totalNet.setScale(2, RoundingMode.HALF_UP));
        bill.setTotalGross(totalGross.setScale(2, RoundingMode.HALF_UP));
        invoiceOrderIdService.assignIfMissing(bill);

        Bill saved = bills.saveAndFlush(bill);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod())) {
            saved = fiscalizationService.fiscalizeBill(saved, companyId);
        }
        deliverAdvance(saved, companyId, order.getId());
        return saved;
    }

    private Bill finalizeExistingAdvance(Bill existing, String targetPaymentStatus, OffsetDateTime paidAt, GuestOrder order) {
        invoiceOrderIdService.assignIfMissing(existing);
        String resolvedLocale = resolveInvoiceLocale(order);
        boolean explicitOrderLocale = order != null && order.getInvoiceLocale() != null && !order.getInvoiceLocale().isBlank();
        if (resolvedLocale != null && !resolvedLocale.isBlank()
                && (existing.getInvoiceLocale() == null || existing.getInvoiceLocale().isBlank()
                || (explicitOrderLocale && !resolvedLocale.equalsIgnoreCase(existing.getInvoiceLocale())))) {
            existing.setInvoiceLocale(resolvedLocale);
        }
        Long orderId = order == null ? null : order.getId();
        if (!BillPaymentStatus.PAID.equals(targetPaymentStatus) || BillPaymentStatus.PAID.equals(existing.getPaymentStatus())) {
            return bills.save(existing);
        }
        existing.setPaymentStatus(BillPaymentStatus.PAID);
        if (existing.getPaidAt() == null) {
            existing.setPaidAt(paidAt == null ? OffsetDateTime.now() : paidAt);
        }
        Bill saved = bills.saveAndFlush(existing);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod())
                && (saved.getFiscalStatus() == null
                || saved.getFiscalStatus() == BillFiscalStatus.NOT_SENT
                || saved.getFiscalStatus() == BillFiscalStatus.PENDING
                || saved.getFiscalStatus() == BillFiscalStatus.FAILED)) {
            saved = fiscalizationService.fiscalizeBill(saved, saved.getCompany().getId());
        }
        deliverAdvance(saved, saved.getCompany().getId(), orderId);
        return saved;
    }

    private void deliverAdvance(Bill bill, Long companyId, Long orderId) {
        try {
            if (isBankTransferPayment(bill.getPaymentMethod()) && !BillPaymentStatus.PAID.equals(bill.getPaymentStatus())) {
                byte[] pdf = billFolioPdfService.generate(bill, companyId);
                invoicePdfS3Service.uploadAndPersistKey(bill, pdf);
                billingEmailService.sendBankTransferFolio(bill, pdf);
            } else {
                byte[] pdf = billFolioPdfService.generate(bill, companyId);
                invoicePdfS3Service.uploadAndPersistKey(bill, pdf);
                billingEmailService.sendPaidBillReceipt(bill, pdf);
            }
        } catch (Exception ex) {
            log.warn("Failed to archive/email advance invoice for guest order {} and bill {}", orderId, bill.getId(), ex);
        }
    }

    private PaymentMethod resolvePaymentMethod(Long companyId, String paymentMethodType) {
        List<PaymentMethod> all = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyId);
        String normalized = (paymentMethodType == null ? "" : paymentMethodType).trim().toUpperCase(Locale.ROOT);
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

    private boolean isPaypalNamedMethod(PaymentMethod method) {
        if (method == null || method.getName() == null) return false;
        return "paypal".equalsIgnoreCase(method.getName().trim());
    }

    private static String resolveInvoiceLocale(GuestOrder order) {
        String language = null;
        if (order != null) {
            language = firstNonBlank(order.getInvoiceLocale(), order.getGuestUser() == null ? null : order.getGuestUser().getLanguage());
        }
        if (language == null || language.isBlank()) return null;
        return language.trim().toLowerCase(Locale.ROOT).startsWith("sl") ? "sl" : "en";
    }

    private static String firstNonBlank(String... values) {
        if (values == null) return null;
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return null;
    }

    private User resolveBillConsultant(Long companyId, SessionBooking booking) {
        if (booking.getConsultant() != null) {
            return booking.getConsultant();
        }
        return users.findAllByCompanyId(companyId).stream()
                .filter(User::isActive)
                .min(Comparator.comparing(User::getId))
                .or(() -> users.findAllByCompanyId(companyId).stream().min(Comparator.comparing(User::getId)))
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.BAD_REQUEST,
                        "Tenancy has no users available to issue the advance invoice against."));
    }

    private static boolean isBankTransferPayment(PaymentMethod paymentMethod) {
        return paymentMethod != null && paymentMethod.getPaymentType() == PaymentType.BANK_TRANSFER;
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

    private static boolean shouldFiscalizeOnBillCreate(PaymentMethod paymentMethod) {
        return paymentMethod != null && paymentMethod.isFiscalized();
    }

}
