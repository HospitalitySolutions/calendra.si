package com.example.app.billing;

import com.example.app.session.SessionBookingRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BillFolioPdfService {
    private static final Logger log = LoggerFactory.getLogger(BillFolioPdfService.class);
    private static final ObjectMapper LAYOUT_MAPPER = new ObjectMapper();

    private final AppSettingRepository settings;
    private final SessionBookingRepository sessionBookings;
    private final FolioPdfService folioPdfService;
    private final UpnQrPayloadBuilder upnQrPayloadBuilder;

    public BillFolioPdfService(
            AppSettingRepository settings,
            SessionBookingRepository sessionBookings,
            FolioPdfService folioPdfService,
            UpnQrPayloadBuilder upnQrPayloadBuilder
    ) {
        this.settings = settings;
        this.sessionBookings = sessionBookings;
        this.folioPdfService = folioPdfService;
        this.upnQrPayloadBuilder = upnQrPayloadBuilder;
    }

    public byte[] generate(Bill bill, Long companyId) {
        return generate(bill, companyId, null);
    }

    public byte[] generate(Bill bill, Long companyId, String locale) {
        var req = buildFolioPdfRequest(bill, companyId);
        req.setLocale(locale);
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
        if (bill.getPaymentMethod() != null) {
            req.setPaymentMethod(bill.getPaymentMethod().getName());
        }
        if (isBankTransferPayment(bill.getPaymentMethod())) {
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
            req.setNotes(buildPaymentNotes(req.getNotes(), reference, companyBic));
            req.setPaymentQrPayload(upnQrPayloadBuilder.build(new UpnQrPayloadBuilder.UpnQrRequest(
                    payerName,
                    payerStreet,
                    payerCity,
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
        } else if (bill.getStripeHostedInvoiceUrl() != null && !bill.getStripeHostedInvoiceUrl().isBlank()) {
            req.setPaymentQrPayload(bill.getStripeHostedInvoiceUrl());
        }

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

    private static boolean isBankTransferPayment(PaymentMethod paymentMethod) {
        return paymentMethod != null && paymentMethod.getPaymentType() == PaymentType.BANK_TRANSFER;
    }

    private String firstNonBlank(String... values) {
        if (values == null) return "";
        for (String value : values) {
            if (value != null && !value.isBlank()) return value.trim();
        }
        return "";
    }
}
