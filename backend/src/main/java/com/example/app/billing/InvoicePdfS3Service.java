package com.example.app.billing;

import com.example.app.company.TenantCodeService;
import java.time.LocalDate;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class InvoicePdfS3Service {

    private static final Logger log = LoggerFactory.getLogger(InvoicePdfS3Service.class);
    private static final Pattern SANITIZE_KEY = Pattern.compile("[^a-zA-Z0-9._-]");

    private final InvoiceS3Properties properties;
    private final BillRepository billRepo;
    private final S3Client s3Client;
    private final TenantCodeService tenantCodeService;

    public InvoicePdfS3Service(
            InvoiceS3Properties properties,
            BillRepository billRepo,
            ObjectProvider<S3Client> s3Client,
            TenantCodeService tenantCodeService) {
        this.properties = properties;
        this.billRepo = billRepo;
        this.s3Client = s3Client.getIfAvailable();
        this.tenantCodeService = tenantCodeService;
    }

    public boolean isReady() {
        return properties.isReady() && s3Client != null;
    }

    public void uploadInvoiceAndPersistKey(Bill bill, byte[] pdf) {
        if (!isReady() || pdf == null || pdf.length == 0) {
            return;
        }
        if (bill.getInvoicePdfObjectKey() != null && !bill.getInvoicePdfObjectKey().isBlank()) {
            return;
        }
        String key = buildInvoiceObjectKey(bill);
        try {
            putPdf(key, pdf);
            bill.setInvoicePdfObjectKey(key);
            billRepo.save(bill);
        } catch (Exception e) {
            log.warn("Failed to store invoice PDF in S3 billId={} key={}", bill.getId(), key, e);
        }
    }

    public void uploadFolioForBill(Bill bill, byte[] pdf) {
        if (!isReady() || pdf == null || pdf.length == 0) {
            return;
        }
        String key = buildFolioObjectKey(bill);
        try {
            putPdf(key, pdf);
        } catch (Exception e) {
            log.warn("Failed to store folio PDF in S3 billId={} key={}", bill.getId(), key, e);
        }
    }

    public void uploadStandaloneFolio(Long companyId, String folioNumber, LocalDate issueDate, byte[] pdf) {
        if (!isReady() || pdf == null || pdf.length == 0 || companyId == null) {
            return;
        }
        String key = buildStandaloneFolioObjectKey(companyId, folioNumber, issueDate);
        try {
            putPdf(key, pdf);
        } catch (Exception e) {
            log.warn("Failed to store standalone folio PDF in S3 companyId={} key={}", companyId, key, e);
        }
    }

    public byte[] downloadIfPresent(Bill bill) {
        if (!isReady()) {
            return null;
        }
        String key = bill.getInvoicePdfObjectKey();
        if (key == null || key.isBlank()) {
            return null;
        }
        try {
            return s3Client.getObjectAsBytes(
                            GetObjectRequest.builder().bucket(properties.getBucket().trim()).key(key).build())
                    .asByteArray();
        } catch (Exception e) {
            log.warn("Failed to load invoice PDF from S3 billId={} key={}", bill.getId(), key, e);
            return null;
        }
    }

    String buildInvoiceObjectKey(Bill bill) {
        return buildBaseFolder(bill) + "/invoice.pdf";
    }

    String buildFolioObjectKey(Bill bill) {
        return buildBaseFolder(bill) + "/folio.pdf";
    }

    String buildStandaloneFolioObjectKey(Long companyId, String folioNumber, LocalDate issueDate) {
        String tenantCode = tenantCodeService.tenantCodeForCompanyId(companyId).orElse(String.valueOf(companyId));
        String safeNumber = sanitizeBillNumber(folioNumber == null || folioNumber.isBlank() ? "folio" : folioNumber);
        int year = issueDate == null ? LocalDate.now().getYear() : issueDate.getYear();
        return properties.normalizedPrefix() + "/tenants/" + tenantCode + "/invoices/" + year + "/" + safeNumber + "/folio.pdf";
    }

    private String buildBaseFolder(Bill bill) {
        String tenantCode = tenantCodeService.tenantCodeOrFallback(bill.getCompany());
        int year = bill.getIssueDate() == null ? LocalDate.now().getYear() : bill.getIssueDate().getYear();
        String safeNum = sanitizeBillNumber(bill.getBillNumber());
        return properties.normalizedPrefix() + "/tenants/" + tenantCode + "/invoices/" + year + "/" + safeNum;
    }

    private String sanitizeBillNumber(String billNumber) {
        String cleaned = SANITIZE_KEY.matcher(billNumber == null ? "unknown" : billNumber).replaceAll("_");
        return cleaned.isBlank() ? "unknown" : cleaned;
    }

    private void putPdf(String key, byte[] pdf) {
        s3Client.putObject(
                PutObjectRequest.builder()
                        .bucket(properties.getBucket().trim())
                        .key(key)
                        .contentType("application/pdf")
                        .build(),
                RequestBody.fromBytes(pdf));
    }
}
