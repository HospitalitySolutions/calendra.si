package com.example.app.billing;

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

    public InvoicePdfS3Service(InvoiceS3Properties properties, BillRepository billRepo, ObjectProvider<S3Client> s3Client) {
        this.properties = properties;
        this.billRepo = billRepo;
        this.s3Client = s3Client.getIfAvailable();
    }

    public boolean isReady() {
        return properties.isReady() && s3Client != null;
    }

    public void uploadAndPersistKey(Bill bill, byte[] pdf) {
        if (!isReady()) {
            return;
        }
        if (pdf == null || pdf.length == 0) {
            return;
        }
        if (bill.getInvoicePdfObjectKey() != null && !bill.getInvoicePdfObjectKey().isBlank()) {
            return;
        }
        String key = buildInvoiceObjectKey(bill);
        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(properties.getBucket().trim())
                            .key(key)
                            .contentType("application/pdf")
                            .build(),
                    RequestBody.fromBytes(pdf));
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
        String key = buildFolioObjectKey(bill.getCompany().getId(), bill.getIssueDate(), bill.getBillNumber());
        upload(key, pdf, bill.getId());
    }

    public void uploadFolioForDocument(Long tenantId, LocalDate issueDate, String billNumber, byte[] pdf) {
        if (!isReady() || pdf == null || pdf.length == 0 || tenantId == null || billNumber == null || billNumber.isBlank()) {
            return;
        }
        String key = buildFolioObjectKey(tenantId, issueDate, billNumber);
        upload(key, pdf, null);
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
        return buildDocumentKey(bill.getCompany().getId(), bill.getIssueDate(), bill.getBillNumber(), "invoice");
    }

    String buildFolioObjectKey(Long tenantId, LocalDate issueDate, String billNumber) {
        return buildDocumentKey(tenantId, issueDate, billNumber, "folio");
    }

    private void upload(String key, byte[] pdf, Long billId) {
        try {
            s3Client.putObject(
                    PutObjectRequest.builder()
                            .bucket(properties.getBucket().trim())
                            .key(key)
                            .contentType("application/pdf")
                            .build(),
                    RequestBody.fromBytes(pdf));
        } catch (Exception e) {
            log.warn("Failed to store PDF in S3 billId={} key={}", billId, key, e);
        }
    }

    private String buildDocumentKey(Long tenantId, LocalDate issueDate, String billNumber, String documentType) {
        String rawPrefix = properties.getPrefix() == null ? "calendra" : properties.getPrefix().trim();
        String prefix = rawPrefix.replaceAll("^/+|/+$", "");
        long safeTenantId = tenantId == null ? 0L : tenantId;
        String safeBillNo = sanitize(billNumber == null ? "unknown" : billNumber);
        int issueYear = issueDate == null ? LocalDate.now().getYear() : issueDate.getYear();
        return prefix + "/tenants/" + safeTenantId + "/invoices/" + issueYear + "/" + safeBillNo + "/" + documentType + "-" + safeBillNo + ".pdf";
    }

    private String sanitize(String value) {
        String sanitized = SANITIZE_KEY.matcher(value).replaceAll("_");
        return sanitized.isBlank() ? "unknown" : sanitized;
    }
}
