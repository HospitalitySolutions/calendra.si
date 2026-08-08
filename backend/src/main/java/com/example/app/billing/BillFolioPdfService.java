package com.example.app.billing;

import com.example.app.session.SessionBookingRepository;
import com.example.app.guest.model.GuestOrderRepository;
import com.example.app.settings.AppSettingRepository;
import com.example.app.settings.SettingKey;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.io.InputStream;
import java.net.URI;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class BillFolioPdfService {
    private static final Logger log = LoggerFactory.getLogger(BillFolioPdfService.class);
    private static final ObjectMapper LAYOUT_MAPPER = new ObjectMapper();
    private static final DateTimeFormatter ISSUE_DATE_TIME_FORMAT = DateTimeFormatter.ofPattern("dd.MM.yyyy HH:mm");
    private static final DateTimeFormatter INVOICE_DATE_FORMAT = DateTimeFormatter.ofPattern("dd.MM.yyyy");

    private final AppSettingRepository settings;
    private final SessionBookingRepository sessionBookings;
    private final GuestOrderRepository guestOrders;
    private final FolioPdfService folioPdfService;
    private final ReceiptPdfService receiptPdfService;
    private final UpnQrPayloadBuilder upnQrPayloadBuilder;
    private final ZoneId invoiceZone;

    @Autowired
    public BillFolioPdfService(
            AppSettingRepository settings,
            SessionBookingRepository sessionBookings,
            GuestOrderRepository guestOrders,
            FolioPdfService folioPdfService,
            ReceiptPdfService receiptPdfService,
            UpnQrPayloadBuilder upnQrPayloadBuilder,
            @Value("${app.reminders.timezone:Europe/Ljubljana}") String invoiceTimezoneId
    ) {
        this.settings = settings;
        this.sessionBookings = sessionBookings;
        this.guestOrders = guestOrders;
        this.folioPdfService = folioPdfService;
        this.receiptPdfService = receiptPdfService;
        this.upnQrPayloadBuilder = upnQrPayloadBuilder;
        this.invoiceZone = safeZone(invoiceTimezoneId);
    }

    /** Backwards-compatible constructor retained for focused unit tests and direct construction. */
    public BillFolioPdfService(
            AppSettingRepository settings,
            SessionBookingRepository sessionBookings,
            GuestOrderRepository guestOrders,
            FolioPdfService folioPdfService,
            ReceiptPdfService receiptPdfService,
            UpnQrPayloadBuilder upnQrPayloadBuilder
    ) {
        this(settings, sessionBookings, guestOrders, folioPdfService, receiptPdfService, upnQrPayloadBuilder, "Europe/Ljubljana");
    }

    /** Backwards-compatible constructor retained for focused unit tests. */
    public BillFolioPdfService(
            AppSettingRepository settings,
            SessionBookingRepository sessionBookings,
            GuestOrderRepository guestOrders,
            FolioPdfService folioPdfService,
            UpnQrPayloadBuilder upnQrPayloadBuilder
    ) {
        this(settings, sessionBookings, guestOrders, folioPdfService, new ReceiptPdfService(), upnQrPayloadBuilder);
    }

    public byte[] generate(Bill bill, Long companyId) {
        return generate(bill, companyId, null);
    }

    public byte[] generate(Bill bill, Long companyId, String locale) {
        return generate(bill, companyId, locale, InvoicePrintFormat.A4);
    }

    public byte[] generate(Bill bill, Long companyId, String locale, InvoicePrintFormat format) {
        String effectiveLocale = resolveInvoiceLocale(bill, locale);
        var req = buildFolioPdfRequest(bill, companyId, effectiveLocale);
        req.setLocale(effectiveLocale);
        return generate(req, companyId, effectiveLocale, format);
    }

    public byte[] generate(FolioPdfRequest req, Long companyId, String locale, InvoicePrintFormat format) {
        if (req == null) throw new IllegalArgumentException("FolioPdfRequest is required");
        String effectiveLocale = locale == null || locale.isBlank() ? req.getLocale() : locale;
        req.setLocale(effectiveLocale);
        InvoicePrintFormat effectiveFormat = format == null ? InvoicePrintFormat.A4 : format;
        if (effectiveFormat == InvoicePrintFormat.POS_58) {
            return receiptPdfService.generate(req, loadPosReceiptLayout(companyId), loadLogoBytes(companyId));
        }
        return folioPdfService.generate(req, loadFolioLayout(companyId), loadLogoBytes(companyId), loadSignatureBytes(companyId));
    }

    /**
     * Render an A4 folio with a caller supplied layout. This is used by the
     * layout editor so unsaved changes can be previewed with the exact same
     * PDF renderer, company logo and signature as a real issued invoice.
     */
    public byte[] generateWithLayout(FolioPdfRequest req, FolioLayoutConfig layout, Long companyId, String locale) {
        if (req == null) throw new IllegalArgumentException("FolioPdfRequest is required");
        if (layout == null) throw new IllegalArgumentException("FolioLayoutConfig is required");
        String effectiveLocale = locale == null || locale.isBlank() ? req.getLocale() : locale;
        req.setLocale(effectiveLocale);
        return folioPdfService.generate(
                req,
                layout,
                loadLogoBytes(companyId),
                loadSignatureBytes(companyId),
                effectiveLocale
        );
    }

    /**
     * Canonical direct-POS payload. Keeping this conversion in the backend ensures
     * native ESC/POS printing uses the same snapshots, discounts, advance-payment
     * calculations, localized payment names and fiscal data as the 58 mm PDF.
     */
    public FolioPdfRequest posReceiptPrintRequest(Bill bill, Long companyId, String locale) {
        if (bill == null || companyId == null) return null;
        String effectiveLocale = resolveInvoiceLocale(bill, locale);
        FolioPdfRequest request = buildFolioPdfRequest(bill, companyId, effectiveLocale);
        request.setLocale(effectiveLocale);
        return request;
    }

    /** Saved 58 mm layout used by both the PDF preview and native POS renderer. */
    public PosReceiptLayoutConfig posReceiptLayout(Long companyId) {
        if (companyId == null) return PosReceiptLayoutConfig.defaultLayout();
        return loadPosReceiptLayout(companyId);
    }

    public static final String BANK_TRANSFER_QR_SETTINGS_MISSING_CODE = "BANK_TRANSFER_QR_SETTINGS_MISSING";

    public List<String> missingOwnBankTransferSettingKeys(Long companyId) {
        List<String> missing = new ArrayList<>();
        if (settingValue(companyId, SettingKey.COMPANY_NAME).isBlank()) missing.add(SettingKey.COMPANY_NAME.name());
        if (settingValue(companyId, SettingKey.COMPANY_ADDRESS).isBlank()) missing.add(SettingKey.COMPANY_ADDRESS.name());
        if (settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE).isBlank()) missing.add(SettingKey.COMPANY_POSTAL_CODE.name());
        if (settingValue(companyId, SettingKey.COMPANY_CITY).isBlank()) missing.add(SettingKey.COMPANY_CITY.name());
        if (settingValue(companyId, SettingKey.COMPANY_IBAN).isBlank()) missing.add(SettingKey.COMPANY_IBAN.name());
        return missing;
    }

    private List<String> missingOwnBankTransferSettingKeys(Bill bill, Long companyId) {
        List<String> missing = new ArrayList<>();
        if (firstNonBlank(bill == null ? null : bill.getIssuerNameSnapshot(), settingValue(companyId, SettingKey.COMPANY_NAME)).isBlank()) missing.add(SettingKey.COMPANY_NAME.name());
        if (firstNonBlank(bill == null ? null : bill.getIssuerAddressSnapshot(), settingValue(companyId, SettingKey.COMPANY_ADDRESS)).isBlank()) missing.add(SettingKey.COMPANY_ADDRESS.name());
        if (firstNonBlank(bill == null ? null : bill.getIssuerPostalCodeSnapshot(), settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE)).isBlank()) missing.add(SettingKey.COMPANY_POSTAL_CODE.name());
        if (firstNonBlank(bill == null ? null : bill.getIssuerCitySnapshot(), settingValue(companyId, SettingKey.COMPANY_CITY)).isBlank()) missing.add(SettingKey.COMPANY_CITY.name());
        if (firstNonBlank(bill == null ? null : bill.getIssuerIbanSnapshot(), settingValue(companyId, SettingKey.COMPANY_IBAN)).isBlank()) missing.add(SettingKey.COMPANY_IBAN.name());
        return missing;
    }

    public void ensureOwnBankTransferSettings(Long companyId) {
        List<String> missing = missingOwnBankTransferSettingKeys(companyId);
        if (!missing.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    BANK_TRANSFER_QR_SETTINGS_MISSING_CODE + ":" + String.join(",", missing));
        }
    }

    private FolioPdfRequest buildFolioPdfRequest(Bill bill, Long companyId, String locale) {
        var req = new FolioPdfRequest();
        req.setFolioNumber(displayInvoiceNumber(bill));
        req.setFolioNumberLabel(documentNumberPrefix(bill, locale));
        req.setFolioDate(formatIssueDateTime(bill));
        req.setFiscalZoi(bill.getFiscalZoi());
        req.setFiscalEor(bill.getFiscalEor());
        req.setFiscalQr(bill.getFiscalQr());
        req.setCompanyName(firstNonBlank(bill.getIssuerNameSnapshot(), settingValue(companyId, SettingKey.COMPANY_NAME)));
        req.setCompanyAddress(firstNonBlank(bill.getIssuerAddressSnapshot(), settingValue(companyId, SettingKey.COMPANY_ADDRESS)));
        req.setCompanyPostalCode(firstNonBlank(bill.getIssuerPostalCodeSnapshot(), settingValue(companyId, SettingKey.COMPANY_POSTAL_CODE)));
        req.setCompanyCity(firstNonBlank(bill.getIssuerCitySnapshot(), settingValue(companyId, SettingKey.COMPANY_CITY)));
        req.setIssueCity(firstNonBlank(
                bill.getLocation() == null ? null : bill.getLocation().getCity(),
                settingValue(companyId, SettingKey.COMPANY_PHYSICAL_CITY),
                req.getCompanyCity()
        ));
        req.setCompanyTaxId(firstNonBlank(bill.getIssuerVatIdSnapshot(), bill.getIssuerTaxNumberSnapshot(), settingValue(companyId, SettingKey.COMPANY_VAT_ID)));
        req.setIban(firstNonBlank(bill.getIssuerIbanSnapshot(), settingValue(companyId, SettingKey.COMPANY_IBAN)));
        BigDecimal discountAmountGross = resolveBillDiscountGross(bill);
        req.setDiscountAmountGross(discountAmountGross);
        req.setSubtotalBeforeDiscountGross(resolveSubtotalBeforeDiscountGross(bill, discountAmountGross));

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
        req.setDateOfService(serviceDate != null ? serviceDate.format(INVOICE_DATE_FORMAT) : "");
        if (bill.getIssueDate() != null) {
            req.setDueDate(bill.getIssueDate().plusDays(resolvePaymentDeadlineDays(companyId)).format(INVOICE_DATE_FORMAT));
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
            req.setNotes(buildInvoiceNotes(bill));
            List<String> missingQrSettings = missingOwnBankTransferSettingKeys(bill, companyId);
            if (missingQrSettings.isEmpty()) {
                String companyIban = firstNonBlank(bill.getIssuerIbanSnapshot(), settingValue(companyId, SettingKey.COMPANY_IBAN));
                String recipientNameForQr = firstNonBlank(req.getCompanyName(), bill.getRecipientCompanyNameSnapshot());
                String recipientStreetForQr = firstNonBlank(req.getCompanyAddress(), bill.getIssuerAddressSnapshot(), settingValue(companyId, SettingKey.COMPANY_ADDRESS));
                String recipientCityForQr = joinPostalAndCity(req.getCompanyPostalCode(), req.getCompanyCity());
                String payerName = companyRecipient
                        ? req.getRecipientName()
                        : (req.getRecipientName() == null || req.getRecipientName().isBlank() ? "Placnik" : req.getRecipientName());
                String payerStreet = companyRecipient ? firstNonBlank(req.getRecipientAddress(), "") : "";
                String payerCity = companyRecipient ? joinPostalAndCity(req.getRecipientPostalCode(), req.getRecipientCity()) : "";
                String reference = BankStatementReconciliationService.bankReferenceForBill(bill);
                String purposeCode = firstNonBlank(settingValue(companyId, SettingKey.BANK_QR_PURPOSE_CODE), "OTHR");
                String purpose = buildUpnPurpose(companyId, bill);
                req.setIban(companyIban);
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
            } else {
                log.info(
                        "Skipping UPN payment QR for bill {} in company {} because required settings are missing: {}",
                        bill.getId(),
                        companyId,
                        String.join(",", missingQrSettings)
                );
            }
        } else if (bill.getStripeHostedInvoiceUrl() != null && !bill.getStripeHostedInvoiceUrl().isBlank()) {
            req.setPaymentQrPayload(bill.getStripeHostedInvoiceUrl());
        }

        String fallbackDate = serviceDate != null ? serviceDate.format(INVOICE_DATE_FORMAT) : "";
        var serviceLines = new ArrayList<FolioPdfRequest.ServiceLine>();
        for (var item : bill.getItems()) {
            var ts = item.getTransactionService();
            String desc = invoiceLineDescription(item);
            BigDecimal totalGrossLine = item.getGrossPrice() != null ? item.getGrossPrice() : BigDecimal.ZERO;
            int qty = item.getQuantity() == null || item.getQuantity() <= 0 ? 1 : item.getQuantity();
            BigDecimal originalGrossLine = item.getOriginalGrossPrice() == null
                    ? totalGrossLine
                    : item.getOriginalGrossPrice().max(totalGrossLine);
            BigDecimal perUnitGross = originalGrossLine.divide(BigDecimal.valueOf(qty), 2, RoundingMode.HALF_UP);
            String taxPct = ts != null && ts.getTaxRate() != null ? ts.getTaxRate().label : "0%";
            BigDecimal netTotal = (item.getNetPrice() != null ? item.getNetPrice() : BigDecimal.ZERO)
                    .multiply(BigDecimal.valueOf(qty));
            BigDecimal taxAmt = totalGrossLine.subtract(netTotal).setScale(2, RoundingMode.HALF_UP);
            BigDecimal originalUnitNet = netUnitFromGross(ts, perUnitGross);

            var sl = new FolioPdfRequest.ServiceLine(desc, qty, originalUnitNet, perUnitGross);
            sl.setDate(fallbackDate);
            sl.setTotalNettPrice(netTotal.setScale(2, RoundingMode.HALF_UP));
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
     * Bills created by older flows can contain either discounted line totals or the
     * original line subtotal together with payment splits for the discounted amount.
     * Detect both representations so the PDF consistently prints Skupaj, Popust and
     * the final payable amount.
     */
    private BigDecimal resolveBillDiscountGross(Bill bill) {
        if (bill == null || isRefundBill(bill) || bill.getItems() == null || bill.getItems().isEmpty()) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        BigDecimal renderedLinesGross = totalItemGross(bill);
        BigDecimal finalInvoiceGross = resolveFinalInvoiceGross(bill, renderedLinesGross);
        BigDecimal structuralDiscount = renderedLinesGross.subtract(finalInvoiceGross)
                .max(BigDecimal.ZERO)
                .setScale(2, RoundingMode.HALF_UP);

        BigDecimal nominalPriceDiscount = BigDecimal.ZERO;
        for (BillItem item : bill.getItems()) {
            if (item == null) continue;
            TransactionService ts = item.getTransactionService();
            Integer qtyRaw = item.getQuantity();
            int qty = qtyRaw == null || qtyRaw <= 0 ? 1 : qtyRaw;
            BigDecimal billedGross = item.getGrossPrice() == null ? BigDecimal.ZERO : item.getGrossPrice();
            BigDecimal storedOriginalGross = item.getOriginalGrossPrice();
            BigDecimal nominalGross = storedOriginalGross != null
                    ? storedOriginalGross
                    : nominalLineGross(ts, qty);
            if (nominalGross.compareTo(billedGross) > 0) {
                nominalPriceDiscount = nominalPriceDiscount.add(nominalGross.subtract(billedGross));
            }
        }
        return structuralDiscount.max(nominalPriceDiscount.setScale(2, RoundingMode.HALF_UP))
                .setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal resolveSubtotalBeforeDiscountGross(Bill bill, BigDecimal discountAmountGross) {
        BigDecimal itemGross = totalItemGross(bill);
        BigDecimal discount = discountAmountGross == null
                ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                : discountAmountGross.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
        if (discount.compareTo(BigDecimal.ZERO) <= 0 || isRefundBill(bill)) {
            return itemGross;
        }
        BigDecimal finalGross = resolveFinalInvoiceGross(bill, itemGross);
        return itemGross.max(finalGross.add(discount)).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal totalItemGross(Bill bill) {
        if (bill == null || bill.getItems() == null) return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        return bill.getItems().stream()
                .filter(java.util.Objects::nonNull)
                .map(item -> item.getGrossPrice() == null ? BigDecimal.ZERO : item.getGrossPrice())
                .reduce(BigDecimal.ZERO, BigDecimal::add)
                .abs()
                .setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal resolveFinalInvoiceGross(Bill bill, BigDecimal fallbackGross) {
        BigDecimal fallback = fallbackGross == null
                ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                : fallbackGross.abs().setScale(2, RoundingMode.HALF_UP);
        BigDecimal persisted = bill == null || bill.getTotalGross() == null
                ? BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)
                : bill.getTotalGross().abs().setScale(2, RoundingMode.HALF_UP);
        BigDecimal paymentSplitTotal = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        if (bill != null && bill.getPaymentSplits() != null) {
            paymentSplitTotal = bill.getPaymentSplits().stream()
                    .filter(java.util.Objects::nonNull)
                    .map(split -> split.getAmountGross() == null ? BigDecimal.ZERO : split.getAmountGross().abs())
                    .reduce(BigDecimal.ZERO, BigDecimal::add)
                    .setScale(2, RoundingMode.HALF_UP);
        }

        BigDecimal resolved = persisted.compareTo(BigDecimal.ZERO) > 0 ? persisted : fallback;
        if (paymentSplitTotal.compareTo(BigDecimal.ZERO) > 0
                && (resolved.compareTo(BigDecimal.ZERO) <= 0 || paymentSplitTotal.compareTo(resolved) < 0)) {
            resolved = paymentSplitTotal;
        }
        return resolved.max(BigDecimal.ZERO).setScale(2, RoundingMode.HALF_UP);
    }

    private BigDecimal netUnitFromGross(TransactionService ts, BigDecimal grossUnit) {
        BigDecimal safeGross = grossUnit == null ? BigDecimal.ZERO : grossUnit;
        BigDecimal multiplier = ts != null && ts.getTaxRate() != null && ts.getTaxRate().multiplier != null
                ? ts.getTaxRate().multiplier
                : BigDecimal.ZERO;
        BigDecimal divisor = BigDecimal.ONE.add(multiplier);
        if (divisor.compareTo(BigDecimal.ZERO) <= 0) return safeGross.setScale(4, RoundingMode.HALF_UP);
        return safeGross.divide(divisor, 4, RoundingMode.HALF_UP);
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

    static String displayInvoiceNumber(Bill bill) {
        if (bill == null) return "";
        String number = trimValue(bill.getBillNumber());
        if (number.isBlank()) return number;
        if ("__OPEN_BILL_PROFORMA_PREVIEW__".equals(bill.getOrderId()) || number.startsWith("PREVIEW-OPEN-")) {
            return number;
        }

        String businessPremise = firstNonBlankValue(
                bill.getFiscalBusinessPremiseSnapshot(),
                bill.getLocation() == null ? null : bill.getLocation().getFiscalBusinessPremiseCode(),
                "1"
        );
        String deviceId = firstNonBlankValue(
                bill.getFiscalDeviceIdSnapshot(),
                bill.getInvoiceSeries() == null ? null : bill.getInvoiceSeries().getElectronicDeviceId(),
                "1"
        );
        String prefix = businessPremise + "-" + deviceId + "-";
        return number.startsWith(prefix) ? number : prefix + number;
    }

    private static String firstNonBlankValue(String... values) {
        if (values == null) return "";
        for (String value : values) {
            String normalized = trimValue(value);
            if (!normalized.isBlank()) return normalized;
        }
        return "";
    }

    private static String trimValue(String value) {
        return value == null ? "" : value.trim();
    }

    private String documentNumberPrefix(Bill bill, String locale) {
        boolean slovenian = isSlovenian(locale);
        boolean serbian = isSerbian(locale);
        if (isOpenBillPreview(bill)) {
            return slovenian || serbian ? "Predračun:" : "Proforma invoice:";
        }
        if (isRefundBill(bill)) {
            return slovenian ? "Dobropis:" : serbian ? "Odobrenje:" : "Refund:";
        }
        BillType type = bill == null || bill.getBillType() == null ? BillType.INVOICE : bill.getBillType();
        if (type == BillType.ADVANCE) {
            return slovenian ? "Predplačilo:" : serbian ? "Avans:" : "Advance:";
        }
        return slovenian || serbian ? "Račun:" : "Invoice:";
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
            return ISSUE_DATE_TIME_FORMAT.format(bill.getCreatedAt().atZone(invoiceZone));
        }
        if (bill.getIssueDate() != null) {
            return ISSUE_DATE_TIME_FORMAT.format(bill.getIssueDate().atStartOfDay());
        }
        return "";
    }

    private static ZoneId safeZone(String raw) {
        try {
            return raw == null || raw.isBlank() ? ZoneId.of("Europe/Ljubljana") : ZoneId.of(raw.trim());
        } catch (Exception ignored) {
            return ZoneId.of("Europe/Ljubljana");
        }
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
            line.setDate(advance.getIssueDate() == null ? "" : advance.getIssueDate().format(INVOICE_DATE_FORMAT));
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
        // Print the same public order id that is also used as the bank-transfer sklic/reference.
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
        if (normalized.startsWith("sl")) return "sl";
        if (normalized.startsWith("sr")) return "sr";
        return "en";
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

    private boolean isSerbian(String locale) {
        return locale != null && locale.trim().toLowerCase(Locale.ROOT).startsWith("sr");
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
        var publicLogoUrl = settingValue(companyId, SettingKey.COMPANY_LOGO_URL);
        byte[] publicLogoBytes = downloadLogoBytesFromUrl(publicLogoUrl);
        if (publicLogoBytes != null && publicLogoBytes.length > 0) return publicLogoBytes;
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

    private byte[] downloadLogoBytesFromUrl(String rawUrl) {
        if (rawUrl == null || rawUrl.isBlank()) return null;
        try (InputStream input = URI.create(rawUrl.trim()).toURL().openStream()) {
            return input.readAllBytes();
        } catch (Exception e) {
            log.warn("Failed to download public company logo from {}", rawUrl, e);
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


    private PosReceiptLayoutConfig loadPosReceiptLayout(Long companyId) {
        var json = settingValue(companyId, SettingKey.FOLIO_POS58_LAYOUT_JSON);
        if (json.isBlank()) return PosReceiptLayoutConfig.defaultLayout();
        try {
            return PosReceiptLayoutConfig.normalize(LAYOUT_MAPPER.readValue(json, PosReceiptLayoutConfig.class));
        } catch (Exception e) {
            log.warn("Invalid POS 58 mm layout JSON for company={}, using defaults", companyId, e);
            return PosReceiptLayoutConfig.defaultLayout();
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
