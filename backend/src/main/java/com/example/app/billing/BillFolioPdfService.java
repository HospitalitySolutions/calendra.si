package com.example.app.billing;

import com.example.app.session.SessionBookingRepository;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BillFolioPdfService {
    private static final Logger log = LoggerFactory.getLogger(BillFolioPdfService.class);
    private static final ObjectMapper LAYOUT_MAPPER = new ObjectMapper();
    private static final DateTimeFormatter ISSUE_DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm");

    private final AppSettingRepository settings;
    private final SessionBookingRepository sessionBookings;
    private final GuestOrderRepository guestOrders;
    private final FolioPdfService folioPdfService;
    private final UpnQrPayloadBuilder upnQrPayloadBuilder;

    public BillFolioPdfService(
            AppSettingRepository settings,
            SessionBookingRepository sessionBookings,
            GuestOrderRepository guestOrders,
            FolioPdfService folioPdfService,
            UpnQrPayloadBuilder upnQrPayloadBuilder
    ) {
        this.settings = settings;
        this.sessionBookings = sessionBookings;
        this.guestOrders = guestOrders;
        this.folioPdfService = folioPdfService;
        this.upnQrPayloadBuilder = upnQrPayloadBuilder;
    }

    public byte[] generate(Bill bill, Long companyId) {
        return generate(bill, companyId, null);
    }

    public byte[] generate(Bill bill, Long companyId, String locale) {
        String effectiveLocale = resolveInvoiceLocale(bill, locale);
        var req = buildFolioPdfRequest(bill, companyId, effectiveLocale);
        req.setLocale(effectiveLocale);
        var layout = loadFolioLayout(companyId);
        return folioPdfService.generate(req, layout, loadLogoBytes(companyId), loadSignatureBytes(companyId));
    }

    public void ensureOwnBankTransferSettings(Long companyId) {
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

    private FolioPdfRequest buildFolioPdfRequest(Bill bill, Long companyId, String locale) {
        var req = new FolioPdfRequest();
        req.setFolioNumber(bill.getBillNumber());
        req.setFolioNumberLabel(documentNumberPrefix(bill, locale));
        req.setFolioDate(formatIssueDateTime(bill));
        req.setFiscalZoi(bill.getFiscalZoi());
        req.setFiscalEor(bill.getFiscalEor());
        req.setFiscalQr(bill.getFiscalQr());
        req.setCompanyName(settingValue(companyId, SettingKey.COMPANY_NAME));
        req.setCompanyAddress(settingValue(companyId, SettingKey.COMPANY_ADDRESS));
        req.setCompanyPostalCode(settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE));
        req.setCompanyCity(settingValue(companyId, SettingKey.COMPANY_CITY));
        req.setCompanyTaxId(settingValue(companyId, SettingKey.COMPANY_VAT_ID));
        req.setIban(settingValue(companyId, SettingKey.COMPANY_IBAN));
        req.setDiscountAmountGross(resolveBillDiscountGross(bill));

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

        boolean companyRecipient = "COMPANY".equalsIgnoreCase(bill.getRecipientTypeSnapshot());
        if (companyRecipient) {
            req.setRecipientName(bill.getRecipientCompanyNameSnapshot() != null ? bill.getRecipientCompanyNameSnapshot() : "");
            req.setRecipientAddress(bill.getRecipientCompanyAddressSnapshot() != null ? bill.getRecipientCompanyAddressSnapshot() : "");
            req.setRecipientPostalCode(bill.getRecipientCompanyPostalCodeSnapshot() != null ? bill.getRecipientCompanyPostalCodeSnapshot() : "");
            req.setRecipientCity(bill.getRecipientCompanyCitySnapshot() != null ? bill.getRecipientCompanyCitySnapshot() : "");
            req.setRecipientVatId(bill.getRecipientCompanyVatIdSnapshot() != null ? bill.getRecipientCompanyVatIdSnapshot() : "");
        } else {
            String first = bill.getClientFirstNameSnapshot() != null ? bill.getClientFirstNameSnapshot() : "";
            String last = bill.getClientLastNameSnapshot() != null ? bill.getClientLastNameSnapshot() : "";
            req.setRecipientName((first + " " + last).trim());
            req.setRecipientAddress(bill.getRecipientCompanyAddressSnapshot() != null ? bill.getRecipientCompanyAddressSnapshot() : "");
            req.setRecipientPostalCode(bill.getRecipientCompanyPostalCodeSnapshot() != null ? bill.getRecipientCompanyPostalCodeSnapshot() : "");
            req.setRecipientCity(bill.getRecipientCompanyCitySnapshot() != null ? bill.getRecipientCompanyCitySnapshot() : "");
            req.setRecipientVatId("");
        }

        req.setIssuedBy(bill.getConsultant().getFirstName() + " " + bill.getConsultant().getLastName());
        List<FolioPdfRequest.PaymentLine> paymentLines = buildPaymentLines(bill, locale);
        req.setPaymentMethods(paymentLines);
        if (!paymentLines.isEmpty()) {
            req.setPaymentMethod(buildPaymentSummary(paymentLines));
        } else if (bill.getPaymentMethod() != null) {
            req.setPaymentMethod(bill.getPaymentMethod().getName());
        }
        List<FolioPdfRequest.AdvancePaymentLine> advancePaymentLines = buildAdvancePaymentLines(bill);
        req.setAdvancePayments(advancePaymentLines);
        req.setUsedAdvancePaymentsGross(totalUsedAdvancePayments(advancePaymentLines));
        BigDecimal bankTransferDue = BillPaymentSplitSupport.resolveBankTransferDueGross(bill);
        req.setToBePaidGross(bankTransferDue.setScale(2, RoundingMode.HALF_UP));
        if (bankTransferDue.compareTo(BigDecimal.ZERO) > 0) {
            ensureOwnBankTransferSettings(companyId);
            String companyIban = settingValue(companyId, SettingKey.COMPANY_IBAN);
            String companyBic = settingValue(companyId, SettingKey.COMPANY_BIC);
            String recipientNameForQr = firstNonBlank(req.getCompanyName(), bill.getRecipientCompanyNameSnapshot());
            String recipientStreetForQr = firstNonBlank(req.getCompanyAddress(), settingValue(companyId, SettingKey.COMPANY_ADDRESS));
            String recipientCityForQr = joinPostalAndCity(req.getCompanyPostalCode(), req.getCompanyCity());
            String payerName = companyRecipient
                    ? req.getRecipientName()
                    : (req.getRecipientName() == null || req.getRecipientName().isBlank() ? "Placnik" : req.getRecipientName());
            String payerStreet = companyRecipient ? firstNonBlank(req.getRecipientAddress(), "") : "";
            String payerCity = companyRecipient ? joinPostalAndCity(req.getRecipientPostalCode(), req.getRecipientCity()) : "";
            String reference = firstNonBlank(bill.getBankTransferReference(), BankStatementReconciliationService.bankReferenceForBill(bill));
            String purposeCode = firstNonBlank(settingValue(companyId, SettingKey.BANK_QR_PURPOSE_CODE), "OTHR");
            String purpose = buildUpnPurpose(companyId, bill);
            req.setIban(companyIban);
            req.setNotes(buildInvoiceNotes(bill));
            req.setPaymentQrPayload(upnQrPayloadBuilder.build(new UpnQrPayloadBuilder.UpnQrRequest(
                    payerName,
                    payerStreet,
                    payerCity,
                    bankTransferDue,
                    purposeCode,
                    purpose,
                    null,
                    companyIban,
                    reference,
                    recipientNameForQr,
                    recipientStreetForQr,
                    recipientCityForQr
            )));
        } else if (bill.getStripeHostedInvoiceUrl() != null && !bill.getStripeHostedInvoiceUrl().isBlank()) {
            req.setPaymentQrPayload(bill.getStripeHostedInvoiceUrl());
        }

        String fallbackDate = serviceDate != null ? serviceDate.toString() : "";
        var serviceLines = new ArrayList<FolioPdfRequest.ServiceLine>();
        for (var item : bill.getItems()) {
            var ts = item.getTransactionService();
            String desc = invoiceLineDescription(item);
            BigDecimal totalGrossLine = item.getGrossPrice() != null ? item.getGrossPrice() : BigDecimal.ZERO;
            int qty = item.getQuantity();
            BigDecimal perUnitGross = qty > 0
                    ? totalGrossLine.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP)
                    : totalGrossLine;
            String taxPct = ts != null && ts.getTaxRate() != null ? ts.getTaxRate().label : "0%";
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

    /**
     * Best-effort discount detection for folio display.
     *
     * Bills currently persist the final discounted line totals, but not a dedicated
     * discount footer amount. To support the configurable folio field, we reconstruct
     * the nominal undiscounted line total from the linked transaction-service price
     * snapshot that the tenant configured, and compare it with the stored billed total.
     * If no positive difference exists, the discount field stays hidden.
     */
    private BigDecimal resolveBillDiscountGross(Bill bill) {
        if (bill == null || bill.getItems() == null || bill.getItems().isEmpty()) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal discount = BigDecimal.ZERO;
        for (BillItem item : bill.getItems()) {
            if (item == null) continue;
            TransactionService ts = item.getTransactionService();
            Integer qtyRaw = item.getQuantity();
            int qty = qtyRaw == null || qtyRaw <= 0 ? 1 : qtyRaw;
            BigDecimal billedGross = item.getGrossPrice() == null ? BigDecimal.ZERO : item.getGrossPrice();
            BigDecimal nominalGross = nominalLineGross(ts, qty);
            if (nominalGross.compareTo(billedGross) > 0) {
                discount = discount.add(nominalGross.subtract(billedGross));
            }
        }
        return discount.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal nominalLineGross(TransactionService ts, int qty) {
        if (ts == null || ts.getNetPrice() == null) return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal netUnit = ts.getNetPrice();
        BigDecimal multiplier = BigDecimal.ONE.add(ts.getTaxRate() == null ? BigDecimal.ZERO : ts.getTaxRate().multiplier);
        return netUnit.multiply(multiplier)
                .multiply(BigDecimal.valueOf(Math.max(1, qty)))
                .setScale(2, RoundingMode.HALF_UP);
    }


    private String invoiceLineDescription(BillItem item) {
        if (item == null) return "";
        String override = item.getInvoiceLineDescription() == null ? "" : item.getInvoiceLineDescription().trim();
        if (!override.isBlank()) {
            return override;
        }
        return invoiceLineDescription(item.getTransactionService());
    }

    private String invoiceLineDescription(TransactionService transactionService) {
        if (transactionService == null) return "";
        String code = transactionService.getCode() == null ? "" : transactionService.getCode().trim();
        String description = transactionService.getDescription() == null ? "" : transactionService.getDescription().trim();
        if (!description.isBlank()) {
            return stripLeadingServiceCode(description, code);
        }
        return code;
    }

    private String documentNumberPrefix(Bill bill, String locale) {
        boolean slovenian = isSlovenian(locale);
        if (isOpenBillPreview(bill)) {
            return slovenian ? "Predračun:" : "Proforma invoice:";
        }
        if (isRefundBill(bill)) {
            return slovenian ? "Dobropis:" : "Refund:";
        }
        BillType type = bill == null || bill.getBillType() == null ? BillType.INVOICE : bill.getBillType();
        if (type == BillType.ADVANCE) {
            return slovenian ? "Predplačilo:" : "Advance:";
        }
        return slovenian ? "Račun:" : "Invoice:";
    }

    private boolean isOpenBillPreview(Bill bill) {
        if (bill == null) return false;
        if ("__OPEN_BILL_PROFORMA_PREVIEW__".equals(bill.getOrderId())) return true;
        return bill.getBillNumber() != null && bill.getBillNumber().startsWith("PREVIEW-OPEN-");
    }

    private boolean isRefundBill(Bill bill) {
        if (bill == null) return false;
        if (bill.getRefundOfBillId() != null) return true;
        if (bill.getRefundReference() != null && !bill.getRefundReference().isBlank()) return true;
        return bill.getTotalGross() != null && bill.getTotalGross().compareTo(BigDecimal.ZERO) < 0;
    }

    private String stripLeadingServiceCode(String description, String code) {
        if (description == null || description.isBlank()) return "";
        if (code == null || code.isBlank()) return description.trim();
        String trimmed = description.trim();
        String prefix = code.trim();
        if (trimmed.length() > prefix.length()
                && trimmed.regionMatches(true, 0, prefix, 0, prefix.length())) {
            String remainder = trimmed.substring(prefix.length()).trim();
            if (remainder.startsWith("-") || remainder.startsWith("–") || remainder.startsWith("—") || remainder.startsWith(":")) {
                return remainder.substring(1).trim();
            }
        }
        return trimmed;
    }

    private String formatIssueDateTime(Bill bill) {
        if (bill == null) return "";
        if (bill.getCreatedAt() != null) {
            return ISSUE_DATE_TIME_FORMAT.format(bill.getCreatedAt().atZone(ZoneId.systemDefault()));
        }
        if (bill.getIssueDate() != null) {
            return ISSUE_DATE_TIME_FORMAT.format(bill.getIssueDate().atStartOfDay());
        }
        return "";
    }

    private List<FolioPdfRequest.AdvancePaymentLine> buildAdvancePaymentLines(Bill bill) {
        var rows = new ArrayList<FolioPdfRequest.AdvancePaymentLine>();
        if (bill == null || bill.getPaymentSplits() == null) return rows;
        for (BillPayment split : bill.getPaymentSplits()) {
            if (split == null || split.getSourceAdvanceBill() == null) continue;
            BigDecimal usedGross = split.getAmountGross() == null ? BigDecimal.ZERO : split.getAmountGross().abs();
            if (usedGross.compareTo(BigDecimal.ZERO) == 0) continue;
            Bill advance = split.getSourceAdvanceBill();
            var line = new FolioPdfRequest.AdvancePaymentLine();
            line.setAdvanceNumber(firstNonBlank(advance.getBillNumber(), advance.getOrderId(), advance.getId() == null ? null : String.valueOf(advance.getId())));
            line.setDate(advance.getIssueDate() == null ? "" : advance.getIssueDate().toString());
            line.setTaxPercent(resolveAdvanceTaxPercentLabel(advance));
            BigDecimal netBasis = (advance.getTotalNet() == null ? resolveAdvanceNetTotal(advance) : advance.getTotalNet())
                    .abs()
                    .setScale(2, RoundingMode.HALF_UP);
            BigDecimal totalGross = (advance.getTotalGross() == null ? usedGross : advance.getTotalGross()).abs().setScale(2, RoundingMode.HALF_UP);
            BigDecimal taxAmount = totalGross.subtract(netBasis).setScale(2, RoundingMode.HALF_UP);
            line.setNetBasis(netBasis);
            line.setTaxAmount(taxAmount);
            line.setTotalGross(totalGross);
            line.setUsedGross(usedGross.setScale(2, RoundingMode.HALF_UP));
            rows.add(line);
        }
        return rows;
    }

    private BigDecimal totalUsedAdvancePayments(List<FolioPdfRequest.AdvancePaymentLine> rows) {
        BigDecimal total = BigDecimal.ZERO;
        if (rows == null) return total.setScale(2, RoundingMode.HALF_UP);
        for (FolioPdfRequest.AdvancePaymentLine row : rows) {
            if (row == null || row.getUsedGross() == null) continue;
            total = total.add(row.getUsedGross().abs());
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal resolveAdvanceNetTotal(Bill advance) {
        if (advance == null || advance.getItems() == null || advance.getItems().isEmpty()) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal total = BigDecimal.ZERO;
        for (BillItem item : advance.getItems()) {
            if (item == null) continue;
            BigDecimal net = item.getNetPrice() == null ? BigDecimal.ZERO : item.getNetPrice();
            int qty = item.getQuantity() == null || item.getQuantity() <= 0 ? 1 : item.getQuantity();
            total = total.add(net.multiply(BigDecimal.valueOf(qty)));
        }
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private String resolveAdvanceTaxPercentLabel(Bill advance) {
        if (advance == null || advance.getItems() == null || advance.getItems().isEmpty()) return "";
        String first = null;
        for (BillItem item : advance.getItems()) {
            if (item == null || item.getTransactionService() == null || item.getTransactionService().getTaxRate() == null) continue;
            String label = item.getTransactionService().getTaxRate().label;
            if (label == null || label.isBlank()) continue;
            if (first == null) first = label;
            else if (!first.equals(label)) return "";
        }
        return first == null ? "" : first;
    }

    private List<FolioPdfRequest.PaymentLine> buildPaymentLines(Bill bill, String locale) {
        var rows = new ArrayList<FolioPdfRequest.PaymentLine>();
        if (bill == null) return rows;

        List<BillPayment> splits = bill.getPaymentSplits() == null ? List.of() : bill.getPaymentSplits();
        for (BillPayment split : splits) {
            if (split == null || split.getPaymentMethod() == null) continue;
            BigDecimal amount = split.getAmountGross() == null ? BigDecimal.ZERO : split.getAmountGross();
            if (amount.compareTo(BigDecimal.ZERO) == 0) continue;
            rows.add(new FolioPdfRequest.PaymentLine(localizedPaymentMethodName(split.getPaymentMethod(), locale), amount.setScale(2, RoundingMode.HALF_UP)));
        }

        if (rows.isEmpty() && bill.getPaymentMethod() != null) {
            BigDecimal amount = bill.getTotalGross() == null ? BigDecimal.ZERO : bill.getTotalGross();
            rows.add(new FolioPdfRequest.PaymentLine(localizedPaymentMethodName(bill.getPaymentMethod(), locale), amount.setScale(2, RoundingMode.HALF_UP)));
        }
        return rows;
    }

    private String buildPaymentSummary(List<FolioPdfRequest.PaymentLine> paymentLines) {
        if (paymentLines == null || paymentLines.isEmpty()) return "";
        var parts = new ArrayList<String>();
        for (FolioPdfRequest.PaymentLine line : paymentLines) {
            if (line == null) continue;
            String name = line.getName() == null ? "" : line.getName().trim();
            if (name.isBlank()) name = "Payment";
            BigDecimal amount = line.getAmountGross() == null ? BigDecimal.ZERO : line.getAmountGross();
            parts.add(name + " " + fmtEur(amount));
        }
        return String.join(", ", parts);
    }

    private static String fmtEur(BigDecimal value) {
        BigDecimal normalized = value == null ? BigDecimal.ZERO : value.setScale(2, RoundingMode.HALF_UP);
        return "EUR " + normalized.toPlainString();
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

    private String buildInvoiceNotes(Bill bill) {
        if (bill == null) return "";
        // Print only the public order id on the folio notes line. The bank RF/sklic remains
        // inside the UPN QR payload for reconciliation, but is no longer repeated visually.
        return firstNonBlank(bill.getOrderId(), resolveGuestOrderReferenceCode(bill));
    }

    private String resolveGuestOrderReferenceCode(Bill bill) {
        if (bill == null || bill.getId() == null) return null;
        try {
            return guestOrders.findByBillId(bill.getId())
                    .map(order -> firstNonBlank(order.getReferenceCode()))
                    .orElse(null);
        } catch (Exception ignored) {
            return null;
        }
    }

    private String resolveInvoiceLocale(Bill bill, String requestedLocale) {
        String value = firstNonBlank(
                requestedLocale,
                bill == null ? null : bill.getInvoiceLocale(),
                resolveGuestOrderInvoiceLocale(bill)
        );
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim().toLowerCase(Locale.ROOT);
        return normalized.startsWith("sl") ? "sl" : "en";
    }

    private String resolveGuestOrderInvoiceLocale(Bill bill) {
        if (bill == null || bill.getId() == null) return null;
        try {
            return guestOrders.findByBillId(bill.getId())
                    .map(order -> firstNonBlank(order.getInvoiceLocale(),
                            order.getGuestUser() == null ? null : order.getGuestUser().getLanguage()))
                    .orElse(null);
        } catch (Exception ignored) {
            return null;
        }
    }

    private boolean isSlovenian(String locale) {
        return locale != null && locale.trim().toLowerCase(Locale.ROOT).startsWith("sl");
    }

    private String localizedPaymentMethodName(PaymentMethod method, String locale) {
        if (method == null) {
            return isSlovenian(locale) ? "Plačilo" : "Payment";
        }
        if (!isSlovenian(locale)) {
            return method.getName() == null || method.getName().isBlank() ? "Payment" : method.getName().trim();
        }
        PaymentType type = method.getPaymentType();
        if (type != null) {
            return switch (type) {
                case BANK_TRANSFER -> "Bančno nakazilo";
                case CARD -> "Kartica";
                case CASH -> "Gotovina";
                case ADVANCE -> "Predplačilo";
                case OTHER -> {
                    String name = method.getName() == null ? "" : method.getName().trim();
                    yield name.equalsIgnoreCase("paypal") ? "PayPal" : (name.isBlank() ? "Drugo" : name);
                }
            };
        }
        String name = method.getName() == null ? "" : method.getName().trim();
        return name.isBlank() ? "Plačilo" : name;
    }

    private String joinPostalAndCity(String postalCode, String city) {
        String pc = postalCode == null ? "" : postalCode.trim();
        String c = city == null ? "" : city.trim();
        if (pc.isBlank()) return c;
        if (c.isBlank()) return pc;
        return pc + " " + c;
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
            return FolioLayoutConfig.normalize(LAYOUT_MAPPER.readValue(json, FolioLayoutConfig.class));
        } catch (Exception e) {
            log.warn("Invalid folio layout JSON for company={}, using defaults", companyId, e);
            return FolioLayoutConfig.defaultLayout();
        }
    }

    private String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }
}
