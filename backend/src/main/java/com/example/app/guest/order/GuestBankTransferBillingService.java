package com.example.app.guest.order;

import com.example.app.billing.*;
import com.example.app.client.Client;
import com.example.app.fiscal.FiscalizationService;
import com.example.app.guest.model.GuestPaymentMethodType;
import com.example.app.guest.model.GuestOrder;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.TypeTransactionService;
import com.example.app.settings.AppSetting;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
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
    private static final ObjectMapper LAYOUT_MAPPER = new ObjectMapper();

    private final BillRepository bills;
    private final PaymentMethodRepository paymentMethods;
    private final AppSettingRepository settings;
    private final SessionBookingRepository sessionBookings;
    private final FiscalizationService fiscalizationService;
    private final BillingEmailService billingEmailService;
    private final InvoicePdfS3Service invoicePdfS3Service;
    private final FolioPdfService folioPdfService;
    private final UpnQrPayloadBuilder upnQrPayloadBuilder;
    private final UserRepository users;
    private final BillPdfService billPdfService;

    public GuestBankTransferBillingService(
            BillRepository bills,
            PaymentMethodRepository paymentMethods,
            AppSettingRepository settings,
            SessionBookingRepository sessionBookings,
            FiscalizationService fiscalizationService,
            BillingEmailService billingEmailService,
            InvoicePdfS3Service invoicePdfS3Service,
            FolioPdfService folioPdfService,
            UpnQrPayloadBuilder upnQrPayloadBuilder,
            UserRepository users,
            BillPdfService billPdfService
    ) {
        this.bills = bills;
        this.paymentMethods = paymentMethods;
        this.settings = settings;
        this.sessionBookings = sessionBookings;
        this.fiscalizationService = fiscalizationService;
        this.billingEmailService = billingEmailService;
        this.invoicePdfS3Service = invoicePdfS3Service;
        this.folioPdfService = folioPdfService;
        this.upnQrPayloadBuilder = upnQrPayloadBuilder;
        this.users = users;
        this.billPdfService = billPdfService;
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
            return finalizeExistingAdvance(existing, targetPaymentStatus, paidAt, order.getId());
        }

        PaymentMethod paymentMethod = resolvePaymentMethod(companyId, paymentMethodType);
        Bill bill = new Bill();
        bill.setCompany(order.getCompany());
        bill.setBillNumber(nextInvoiceNumber(companyId));
        bill.setBillType(BillType.ADVANCE);
        bill.setClient(order.getClient());
        setBillClientSnapshot(bill, order.getClient());
        setBillRecipientPersonSnapshot(bill);
        bill.setConsultant(resolveBillConsultant(companyId, booking));
        bill.setPaymentMethod(paymentMethod);
        bill.setIssueDate(LocalDate.now());
        bill.setSourceSessionIdSnapshot(booking.getId());
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

        Bill saved = bills.saveAndFlush(bill);
        if (shouldFiscalizeOnBillCreate(saved.getPaymentMethod())) {
            saved = fiscalizationService.fiscalizeBill(saved, companyId);
        }
        deliverAdvance(saved, companyId, order.getId());
        return saved;
    }

    private Bill finalizeExistingAdvance(Bill existing, String targetPaymentStatus, OffsetDateTime paidAt, Long orderId) {
        if (!BillPaymentStatus.PAID.equals(targetPaymentStatus) || BillPaymentStatus.PAID.equals(existing.getPaymentStatus())) {
            return existing;
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
                byte[] pdf = generateArchiveFolioPdf(bill, companyId);
                invoicePdfS3Service.uploadAndPersistKey(bill, pdf);
                billingEmailService.sendBankTransferFolio(bill, pdf);
            } else {
                byte[] pdf = billPdfService.generatePdf(bill, companyId);
                invoicePdfS3Service.uploadAndPersistKey(bill, pdf);
                billingEmailService.sendPaidBillReceipt(bill, pdf);
            }
        } catch (Exception ex) {
            log.warn("Failed to archive/email advance invoice for guest order {} and bill {}", orderId, bill.getId(), ex);
        }
    }

    private PaymentMethod resolvePaymentMethod(Long companyId, String paymentMethodType) {
        List<PaymentMethod> all = paymentMethods.findAllByCompanyIdOrderByNameAsc(companyId);
        PaymentType desired = switch ((paymentMethodType == null ? "" : paymentMethodType).trim().toUpperCase(Locale.ROOT)) {
            case "BANK_TRANSFER" -> PaymentType.BANK_TRANSFER;
            case "PAYPAL", "CARD" -> PaymentType.CARD;
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

    private byte[] generateArchiveFolioPdf(Bill bill, Long companyId) {
        var req = buildFolioPdfRequest(bill, companyId);
        var layout = loadFolioLayout(companyId);
        return folioPdfService.generate(req, layout, loadLogoBytes(companyId), loadSignatureBytes(companyId));
    }

    private FolioPdfRequest buildFolioPdfRequest(Bill bill, Long companyId) {
        var req = new FolioPdfRequest();
        req.setFolioNumber(bill.getBillNumber());
        req.setFolioDate(bill.getIssueDate() != null ? bill.getIssueDate().toString() : "");
        req.setCompanyName(settingValue(companyId, SettingKey.COMPANY_NAME));
        req.setCompanyAddress(settingValue(companyId, SettingKey.COMPANY_ADDRESS));
        req.setCompanyPostalCode(settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE));
        req.setCompanyCity(settingValue(companyId, SettingKey.COMPANY_CITY));
        req.setCompanyTaxId(settingValue(companyId, SettingKey.COMPANY_VAT_ID));
        req.setIban(settingValue(companyId, SettingKey.COMPANY_IBAN));

        LocalDate serviceDate = null;
        Long srcSessionId = bill.getSourceSessionIdSnapshot();
        if (srcSessionId != null) {
            serviceDate = sessionBookings.findById(srcSessionId)
                    .map(sb -> sb.getStartTime() != null ? sb.getStartTime().toLocalDate() : null)
                    .orElse(null);
        }
        if (serviceDate == null) {
            serviceDate = bill.getIssueDate();
        }
        req.setDateOfService(serviceDate != null ? serviceDate.toString() : "");
        if (bill.getIssueDate() != null) {
            req.setDueDate(bill.getIssueDate().plusDays(resolvePaymentDeadlineDays(companyId)).toString());
        }

        String first = bill.getClientFirstNameSnapshot() != null ? bill.getClientFirstNameSnapshot() : "";
        String last = bill.getClientLastNameSnapshot() != null ? bill.getClientLastNameSnapshot() : "";
        req.setRecipientName((first + " " + last).trim());

        req.setIssuedBy(bill.getConsultant().getFirstName() + " " + bill.getConsultant().getLastName());
        if (bill.getPaymentMethod() != null) {
            req.setPaymentMethod(bill.getPaymentMethod().getName());
        }
        ensureOwnBankTransferSettings(companyId);
        String companyIban = settingValue(companyId, SettingKey.COMPANY_IBAN);
        String companyBic = settingValue(companyId, SettingKey.COMPANY_BIC);
        String recipientNameForQr = firstNonBlank(req.getCompanyName());
        String recipientStreetForQr = firstNonBlank(req.getCompanyAddress());
        String recipientCityForQr = joinPostalAndCity(req.getCompanyPostalCode(), req.getCompanyCity());
        String reference = firstNonBlank(bill.getBankTransferReference(), BankStatementReconciliationService.bankReferenceForBill(bill));
        String purposeCode = firstNonBlank(settingValue(companyId, SettingKey.BANK_QR_PURPOSE_CODE), "OTHR");
        String purpose = buildUpnPurpose(companyId, bill);
        req.setIban(companyIban);
        req.setNotes(buildPaymentNotes(req.getNotes(), reference, companyBic));
        req.setPaymentQrPayload(upnQrPayloadBuilder.build(new UpnQrPayloadBuilder.UpnQrRequest(
                req.getRecipientName() == null || req.getRecipientName().isBlank() ? "Placnik" : req.getRecipientName(),
                "",
                "",
                bill.getTotalGross(),
                purposeCode,
                purpose,
                null,
                companyIban,
                reference,
                recipientNameForQr,
                recipientStreetForQr,
                recipientCityForQr
        )));

        String fallbackDate = serviceDate != null ? serviceDate.toString() : "";
        var serviceLines = new ArrayList<FolioPdfRequest.ServiceLine>();
        for (var item : bill.getItems()) {
            var ts = item.getTransactionService();
            String desc = ts.getCode() + " - " + ts.getDescription();
            BigDecimal totalGrossLine = item.getGrossPrice() != null ? item.getGrossPrice() : BigDecimal.ZERO;
            int qty = item.getQuantity();
            BigDecimal perUnitGross = qty > 0
                    ? totalGrossLine.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP)
                    : totalGrossLine;
            String taxPct = ts.getTaxRate() != null ? ts.getTaxRate().label : "0%";
            BigDecimal netTotal = (item.getNetPrice() != null ? item.getNetPrice() : BigDecimal.ZERO)
                    .multiply(BigDecimal.valueOf(qty));
            BigDecimal taxAmt = totalGrossLine.subtract(netTotal).setScale(2, RoundingMode.HALF_UP);

            var sl = new FolioPdfRequest.ServiceLine(desc, qty, item.getNetPrice(), perUnitGross);
            sl.setDate(fallbackDate);
            sl.setTaxPercent(taxPct);
            sl.setTaxAmount(taxAmt);
            sl.setTotalPrice(totalGrossLine);
            serviceLines.add(sl);
        }
        req.setServices(serviceLines);
        return req;
    }

    private int resolvePaymentDeadlineDays(Long companyId) {
        String deadlineDays = settingValue(companyId, SettingKey.PAYMENT_DEADLINE_DAYS);
        try {
            return Integer.parseInt(deadlineDays);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private String buildUpnPurpose(Long companyId, Bill bill) {
        String base = firstNonBlank(settingValue(companyId, SettingKey.BANK_QR_PURPOSE_TEXT), "PLACILO FOLIA");
        String suffix = firstNonBlank(bill.getBillNumber(), bill.getStripeInvoiceNumber());
        String value = (base + " " + suffix).trim();
        return value.length() <= 42 ? value : value.substring(0, 42);
    }

    private String buildPaymentNotes(String existing, String reference, String bic) {
        List<String> parts = new ArrayList<>();
        if (existing != null && !existing.isBlank()) parts.add(existing.trim());
        if (reference != null && !reference.isBlank()) parts.add("Reference: " + reference);
        if (bic != null && !bic.isBlank()) parts.add("BIC/SWIFT: " + bic);
        return String.join(" | ", parts);
    }

    private String joinPostalAndCity(String postalCode, String city) {
        String pc = postalCode == null ? "" : postalCode.trim();
        String c = city == null ? "" : city.trim();
        if (pc.isBlank()) return c;
        if (c.isBlank()) return pc;
        return pc + " " + c;
    }

    private void ensureOwnBankTransferSettings(Long companyId) {
        List<String> missing = new ArrayList<>();
        if (settingValue(companyId, SettingKey.COMPANY_NAME).isBlank()) missing.add("company name");
        if (settingValue(companyId, SettingKey.COMPANY_ADDRESS).isBlank()) missing.add("company address");
        if (settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE).isBlank()) missing.add("company postal code");
        if (settingValue(companyId, SettingKey.COMPANY_CITY).isBlank()) missing.add("company city");
        if (settingValue(companyId, SettingKey.COMPANY_IBAN).isBlank()) missing.add("company IBAN");
        if (!missing.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Bank transfer folio requires these Configuration fields: " + String.join(", ", missing));
        }
    }

    private String settingValue(Long companyId, SettingKey key) {
        return settings.findByCompanyIdAndKey(companyId, key)
                .map(s -> s.getValue() == null ? "" : s.getValue())
                .orElse("");
    }

    private byte[] loadLogoBytes(Long companyId) {
        var dataUri = settingValue(companyId, SettingKey.COMPANY_LOGO_BASE64);
        if (dataUri.isBlank()) return null;
        int commaIdx = dataUri.indexOf(',');
        if (commaIdx < 0) return null;
        try {
            return java.util.Base64.getDecoder().decode(dataUri.substring(commaIdx + 1));
        } catch (IllegalArgumentException e) {
            log.warn("Invalid base64 logo for company {}, ignoring", companyId, e);
            return null;
        }
    }

    private byte[] loadSignatureBytes(Long companyId) {
        var dataUri = settingValue(companyId, SettingKey.FOLIO_SIGNATURE_BASE64);
        if (dataUri.isBlank()) return null;
        int commaIdx = dataUri.indexOf(',');
        if (commaIdx < 0) return null;
        try {
            return java.util.Base64.getDecoder().decode(dataUri.substring(commaIdx + 1));
        } catch (IllegalArgumentException e) {
            log.warn("Invalid base64 signature for company {}, ignoring", companyId, e);
            return null;
        }
    }

    private FolioLayoutConfig loadFolioLayout(Long companyId) {
        var json = settingValue(companyId, SettingKey.FOLIO_TEMPLATE_LAYOUT_JSON);
        var trimmed = json.strip();
        if (json.isBlank() || !trimmed.startsWith("{") || !trimmed.contains("\"fields\"")) {
            return FolioLayoutConfig.defaultLayout();
        }
        try {
            return LAYOUT_MAPPER.readValue(json, FolioLayoutConfig.class);
        } catch (Exception e) {
            log.warn("Invalid folio layout JSON for company={}, using defaults", companyId, e);
            return FolioLayoutConfig.defaultLayout();
        }
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

    private static boolean shouldFiscalizeOnBillCreate(PaymentMethod paymentMethod) {
        return paymentMethod != null && paymentMethod.isFiscalized();
    }

    private String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }
}
