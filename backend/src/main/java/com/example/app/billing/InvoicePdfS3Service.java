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
    /** Resolve lazily so the client is never captured as null when created after this bean. */
    private final ObjectProvider<S3Client> s3ClientProvider;

    public InvoicePdfS3Service(InvoiceS3Properties properties, BillRepository billRepo, ObjectProvider<S3Client> s3ClientProvider) {
        this.properties = properties;
        this.billRepo = billRepo;
        this.s3ClientProvider = s3ClientProvider;
    }

    private S3Client s3Client() {
        return s3ClientProvider.getIfAvailable();
    }

    public boolean isReady() {
        return properties.isReady() && s3Client() != null;
    }

    /**
     * Upload PDF bytes once and persist {@link Bill#getInvoicePdfObjectKey()} when archival is enabled.
     * No-op if disabled, if a key already exists, or if {@code pdf} is null/empty.
     */
    public void uploadAndPersistKey(Bill bill, byte[] pdf) {
        if (!properties.isEnabled()) {
            return;
        }
        if (properties.getBucket() == null || properties.getBucket().isBlank()) {
            log.warn(
                    "Invoice S3: APP_INVOICE_S3_ENABLED is true but bucket is empty — add APP_INVOICE_S3_BUCKET to env/Secrets Manager. billId={}",
                    bill.getId());
            return;
        }
        S3Client client = s3Client();
        if (client == null) {
            log.warn(
                    "Invoice S3: enabled with bucket set but no S3Client bean — check Spring AWS S3 auto-config and region/credentials. billId={}",
                    bill.getId());
            return;
        }
        if (pdf == null || pdf.length == 0) {
            log.warn("Invoice S3 archival skipped billId={}: empty PDF bytes", bill.getId());
            return;
        }
        if (bill.getInvoicePdfObjectKey() != null && !bill.getInvoicePdfObjectKey().isBlank()) {
            return;
        }
        String key = buildObjectKey(bill);
        try {
            client.putObject(
                    PutObjectRequest.builder()
                            .bucket(properties.getBucket().trim())
                            .key(key)
                            .contentType("application/pdf")
                            .build(),
                    RequestBody.fromBytes(pdf));
            bill.setInvoicePdfObjectKey(key);
            billRepo.save(bill);
            log.info("Archived invoice PDF to s3://{}/{} billId={}", properties.getBucket().trim(), key, bill.getId());
        } catch (Exception e) {
            log.warn("Failed to store invoice PDF in S3 billId={} key={}", bill.getId(), key, e);
        }
    }

    /**
     * Return archived PDF bytes, or {@code null} if there is no key, S3 is disabled, or download failed.
     */
    public byte[] downloadIfPresent(Bill bill) {
        if (!isReady()) {
            return null;
        }
        S3Client client = s3Client();
        if (client == null) {
            return null;
        }
        String key = bill.getInvoicePdfObjectKey();
        if (key == null || key.isBlank()) {
            return null;
        }
        try {
            return client.getObjectAsBytes(
                            GetObjectRequest.builder().bucket(properties.getBucket().trim()).key(key).build())
                    .asByteArray();
        } catch (Exception e) {
            log.warn("Failed to load invoice PDF from S3 billId={} key={}", bill.getId(), key, e);
            return null;
        }
    }

    String buildObjectKey(Bill bill) {
        String rawPrefix = properties.getPrefix() == null ? "calendra/tenants" : properties.getPrefix().trim();
        String prefix = rawPrefix.replaceAll("^/+|/+$", "");
        long tenancyId = bill.getCompany().getId();
        LocalDate issueDate = bill.getIssueDate();
        int year = issueDate == null ? LocalDate.now().getYear() : issueDate.getYear();
        long billId = bill.getId() == null ? 0L : bill.getId();
        String safeNum = bill.getBillNumber() == null ? "unknown" : SANITIZE_KEY.matcher(bill.getBillNumber()).replaceAll("_");
        return prefix + "/" + tenancyId + "/invoices/" + year + "/" + billId + "_" + safeNum + ".pdf";
    }
}
