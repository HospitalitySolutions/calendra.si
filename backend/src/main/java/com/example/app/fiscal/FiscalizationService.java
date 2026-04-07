package com.example.app.fiscal;

import com.example.app.billing.Bill;
import com.example.app.billing.BillFiscalStatus;
import com.example.app.billing.BillItem;
import com.example.app.billing.BillPdfService;
import com.example.app.billing.BillRepository;
import com.example.app.billing.InvoicePdfS3Service;
import com.example.app.billing.TaxRate;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.example.app.user.User;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class FiscalizationService {
    private static final Logger log = LoggerFactory.getLogger(FiscalizationService.class);
    private static final ObjectMapper JSON = new ObjectMapper();
    private final FiscalSettingsService fiscalSettings;
    private final FiscalSignatureService signatureService;
    private final FursJsonClient client;
    private final BillRepository bills;
    private final BillPdfService billPdfService;
    private final InvoicePdfS3Service invoicePdfS3Service;

    public FiscalizationService(
            FiscalSettingsService fiscalSettings,
            FiscalSignatureService signatureService,
            FursJsonClient client,
            BillRepository bills,
            BillPdfService billPdfService,
            InvoicePdfS3Service invoicePdfS3Service
    ) {
        this.fiscalSettings = fiscalSettings;
        this.signatureService = signatureService;
        this.client = client;
        this.bills = bills;
        this.billPdfService = billPdfService;
        this.invoicePdfS3Service = invoicePdfS3Service;
    }

    public Bill fiscalizeBill(Bill bill, Long companyId) {
        FiscalSettings settings = fiscalSettings.forCompany(companyId);
        int attempts = bill.getFiscalAttemptCount() == null ? 0 : bill.getFiscalAttemptCount();
        bill.setFiscalAttemptCount(attempts + 1);
        List<Map<String, Object>> trace = new ArrayList<>();
        try {
            String issueDateTime = bill.getIssueDate().atStartOfDay().atOffset(ZoneOffset.UTC)
                    .truncatedTo(ChronoUnit.SECONDS)
                    .toString();
            trace.add(logStep("Preparing invoice for fiscal validation", "ok", "Invoice data is prepared."));
            String protectedId = buildProtectedId(companyId, settings, bill, issueDateTime);
            trace.add(logStep("Creating fiscal protection code", "ok", "Protection code created."));
            Map<String, Object> payload = buildInvoicePayload(bill, settings, issueDateTime, protectedId);
            trace.add(logStep("Signing fiscal request", "ok", "Request is signed with your fiscal certificate."));
            String token = signatureService.createJwsToken(companyId, settings, payload);
            trace.add(logStep("Sending request to tax authority", "ok", "Request sent to FURS."));
            FiscalResponse response = client.post(
                    settings.invoiceUrl(),
                    token,
                    companyId,
                    settings.certificatePassword()
            );
            trace.add(logStep(
                    response.success() ? "Response received from tax authority" : "Tax authority returned an error",
                    response.success() ? "ok" : "error",
                    response.success()
                            ? ("Invoice confirmed." + (response.eor() == null ? "" : " EOR: " + response.eor()))
                            : (response.error() == null ? "Fiscal validation failed." : response.error())
            ));
            bill.setFiscalZoi(protectedId);
            bill.setFiscalMessageId(response.messageId());
            bill.setFiscalQr(response.qr());
            bill.setFiscalRequestBody(response.requestBody());
            bill.setFiscalResponseBody(response.responseBody());
            bill.setFiscalSentAt(OffsetDateTime.now(ZoneOffset.UTC));
            if (response.success()) {
                bill.setFiscalStatus(BillFiscalStatus.SENT);
                bill.setFiscalEor(response.eor());
                bill.setFiscalLastError(null);
            } else {
                bill.setFiscalStatus(BillFiscalStatus.FAILED);
                bill.setFiscalLastError(response.error());
            }
        } catch (Exception e) {
            trace.add(logStep("Fiscal sending failed", "error", e.getMessage() == null ? "Unexpected error." : e.getMessage()));
            bill.setFiscalStatus(BillFiscalStatus.FAILED);
            bill.setFiscalLastError(e.getMessage());
            bill.setFiscalRequestBody(null);
            bill.setFiscalResponseBody(null);
            bill.setFiscalSentAt(OffsetDateTime.now(ZoneOffset.UTC));
        }
        bill.setFiscalLogJson(toJson(trace));
        Bill saved = bills.save(bill);
        if (saved.getFiscalStatus() == BillFiscalStatus.SENT) {
            try {
                byte[] pdf = billPdfService.generatePdf(saved, companyId);
                invoicePdfS3Service.uploadAndPersistKey(saved, pdf);
            } catch (Exception e) {
                log.warn("Invoice PDF generation or S3 archival failed after fiscal success billId={}", saved.getId(), e);
            }
        }
        return saved;
    }

    public FiscalResponse registerBusinessPremise(Long companyId, User user) {
        FiscalSettings settings = fiscalSettings.forCompany(companyId);
        Map<String, Object> header = new LinkedHashMap<>();
        header.put("MessageID", UUID.randomUUID().toString());
        header.put("DateTime", Instant.now().truncatedTo(ChronoUnit.SECONDS).toString());

        Map<String, Object> payload = new LinkedHashMap<>();
        Map<String, Object> businessPremise = new LinkedHashMap<>();
        businessPremise.put("TaxNumber", parseLongOrOriginal(settings.taxNumber()));
        businessPremise.put("BusinessPremiseID", settings.businessPremiseId());
        businessPremise.put("ValidityDate", LocalDate.now(ZoneOffset.UTC).toString());

        Map<String, Object> address = new LinkedHashMap<>();
        address.put("Street", settings.companyAddress());
        address.put("HouseNumber", settings.houseNumber());
        address.put("HouseNumberAdditional", settings.houseNumberAdditional());
        address.put("Community", settings.companyCity());
        address.put("City", settings.companyCity());
        address.put("PostalCode", settings.companyPostalCode());

        Map<String, Object> realEstate = new LinkedHashMap<>();
        Map<String, Object> propertyId = new LinkedHashMap<>();
        propertyId.put("CadastralNumber", parseLongOrOriginal(settings.cadastralNumber()));
        propertyId.put("BuildingNumber", parseLongOrOriginal(settings.buildingNumber()));
        propertyId.put("BuildingSectionNumber", parseLongOrOriginal(settings.buildingSectionNumber()));
        realEstate.put("PropertyID", propertyId);
        realEstate.put("Address", address);

        Map<String, Object> bpIdentifier = new LinkedHashMap<>();
        bpIdentifier.put("RealEstateBP", realEstate);
        businessPremise.put("BPIdentifier", bpIdentifier);

        List<Map<String, Object>> suppliers = new ArrayList<>();
        Map<String, Object> supplier = new LinkedHashMap<>();
        supplier.put("TaxNumber", parseLongOrOriginal(settings.softwareSupplierTaxNumber()));
        suppliers.add(supplier);
        businessPremise.put("SoftwareSupplier", suppliers);

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("Header", header);
        request.put("BusinessPremise", businessPremise);
        payload.put("BusinessPremiseRequest", request);

        String token = signatureService.createJwsToken(companyId, settings, payload);
        return client.post(
                settings.premiseUrl(),
                token,
                companyId,
                settings.certificatePassword()
        );
    }

    private Map<String, Object> buildInvoicePayload(Bill bill, FiscalSettings settings, String issueDateTime, String protectedId) {
        Map<String, Object> payload = new LinkedHashMap<>();

        Map<String, Object> header = new LinkedHashMap<>();
        header.put("MessageID", UUID.randomUUID().toString());
        header.put("DateTime", issueDateTime);

        Map<String, Object> invoiceIdentifier = new LinkedHashMap<>();
        invoiceIdentifier.put("BusinessPremiseID", settings.businessPremiseId());
        invoiceIdentifier.put("ElectronicDeviceID", settings.deviceId());
        invoiceIdentifier.put("InvoiceNumber", bill.getBillNumber());

        Map<String, Object> invoice = new LinkedHashMap<>();
        invoice.put("TaxNumber", parseLongOrOriginal(settings.taxNumber()));
        invoice.put("IssueDateTime", issueDateTime);
        invoice.put("NumberingStructure", "B");
        invoice.put("InvoiceIdentifier", invoiceIdentifier);
        invoice.put("InvoiceAmount", bill.getTotalGross().setScale(2, RoundingMode.HALF_UP));
        invoice.put("PaymentAmount", bill.getTotalGross().setScale(2, RoundingMode.HALF_UP));
        invoice.put("TaxesPerSeller", buildTaxesPerSeller(bill));
        invoice.put("OperatorTaxNumber", parseLongOrOriginal(bill.getConsultant().getVatId() == null ? "" : bill.getConsultant().getVatId()));
        invoice.put("ProtectedID", protectedId);

        Map<String, Object> request = new LinkedHashMap<>();
        request.put("Header", header);
        request.put("Invoice", invoice);
        payload.put("InvoiceRequest", request);
        return payload;
    }

    private List<Map<String, Object>> buildTaxesPerSeller(Bill bill) {
        BigDecimal taxable22 = BigDecimal.ZERO;
        BigDecimal tax22 = BigDecimal.ZERO;
        BigDecimal taxable95 = BigDecimal.ZERO;
        BigDecimal tax95 = BigDecimal.ZERO;
        BigDecimal taxable0 = BigDecimal.ZERO;
        BigDecimal tax0 = BigDecimal.ZERO;

        for (BillItem item : bill.getItems()) {
            if (item.getTransactionService() == null || item.getTransactionService().getTaxRate() == null) {
                continue;
            }
            BigDecimal net = item.getNetPrice() == null ? BigDecimal.ZERO : item.getNetPrice();
            BigDecimal gross = item.getGrossPrice() == null ? BigDecimal.ZERO : item.getGrossPrice();
            BigDecimal tax = gross.subtract(net);
            TaxRate rate = item.getTransactionService().getTaxRate();
            if (rate == TaxRate.VAT_22) {
                taxable22 = taxable22.add(net);
                tax22 = tax22.add(tax);
            } else if (rate == TaxRate.VAT_9_5) {
                taxable95 = taxable95.add(net);
                tax95 = tax95.add(tax);
            } else if (rate == TaxRate.VAT_0 || rate == TaxRate.NO_VAT) {
                taxable0 = taxable0.add(net);
                tax0 = tax0.add(tax);
            }
        }

        List<Map<String, Object>> vatRows = new ArrayList<>();
        if (taxable22.compareTo(BigDecimal.ZERO) > 0 || tax22.compareTo(BigDecimal.ZERO) > 0) {
            vatRows.add(vatRow(new BigDecimal("22.00"), taxable22, tax22));
        }
        if (taxable95.compareTo(BigDecimal.ZERO) > 0 || tax95.compareTo(BigDecimal.ZERO) > 0) {
            vatRows.add(vatRow(new BigDecimal("9.50"), taxable95, tax95));
        }
        if (taxable0.compareTo(BigDecimal.ZERO) > 0 || tax0.compareTo(BigDecimal.ZERO) > 0) {
            vatRows.add(vatRow(new BigDecimal("0.00"), taxable0, tax0));
        }

        List<Map<String, Object>> taxesPerSeller = new ArrayList<>();
        Map<String, Object> seller = new LinkedHashMap<>();
        seller.put("VAT", vatRows);
        taxesPerSeller.add(seller);
        return taxesPerSeller;
    }

    private Map<String, Object> vatRow(BigDecimal taxRate, BigDecimal taxableAmount, BigDecimal taxAmount) {
        Map<String, Object> vat = new LinkedHashMap<>();
        vat.put("TaxRate", taxRate.setScale(2, RoundingMode.HALF_UP));
        vat.put("TaxableAmount", taxableAmount.setScale(2, RoundingMode.HALF_UP));
        vat.put("TaxAmount", taxAmount.setScale(2, RoundingMode.HALF_UP));
        return vat;
    }

    private String buildProtectedId(Long companyId, FiscalSettings settings, Bill bill, String issueDateTime) {
        Map<String, Object> protectedIdBase = new LinkedHashMap<>();
        protectedIdBase.put("TaxNumber", settings.taxNumber());
        protectedIdBase.put("IssueDateTime", issueDateTime);
        protectedIdBase.put("InvoiceNumber", bill.getBillNumber());
        protectedIdBase.put("BusinessPremiseID", settings.businessPremiseId());
        protectedIdBase.put("ElectronicDeviceID", settings.deviceId());
        protectedIdBase.put("InvoiceAmount", bill.getTotalGross().setScale(2, RoundingMode.HALF_UP).toPlainString());
        String signature = signatureService.signPayload(companyId, settings, protectedIdBase);
        return signatureService.computeZoi(signature);
    }

    private Object parseLongOrOriginal(String value) {
        if (value == null) return "";
        String trimmed = value.trim();
        if (trimmed.isBlank()) return "";
        try {
            return Long.parseLong(trimmed);
        } catch (NumberFormatException ignored) {
            return trimmed;
        }
    }

    private Map<String, Object> logStep(String title, String status, String detail) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("at", Instant.now().toString());
        row.put("title", title);
        row.put("status", status);
        row.put("detail", detail);
        return row;
    }

    private String toJson(Object value) {
        try {
            return JSON.writeValueAsString(value);
        } catch (Exception ignored) {
            return "[]";
        }
    }

}
