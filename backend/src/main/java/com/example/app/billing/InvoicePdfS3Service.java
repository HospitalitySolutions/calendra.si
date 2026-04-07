package com.example.app.billing;

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

    /**
     * Upload PDF bytes once and persist {@link Bill#getInvoicePdfObjectKey()} when archival is enabled.
     * No-op if disabled, if a key already exists, or if {@code pdf} is null/empty.
     */
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
        String key = buildObjectKey(bill);
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

    /**
     * Return archived PDF bytes, or {@code null} if there is no key, S3 is disabled, or download failed.
     */
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

    String buildObjectKey(Bill bill) {
        String rawPrefix = properties.getPrefix() == null ? "invoices" : properties.getPrefix().trim();
        String prefix = rawPrefix.replaceAll("^/+|/+$", "");
        long companyId = bill.getCompany().getId();
        long billId = bill.getId() == null ? 0L : bill.getId();
        String safeNum = bill.getBillNumber() == null ? "unknown" : SANITIZE_KEY.matcher(bill.getBillNumber()).replaceAll("_");
        return prefix + "/" + companyId + "/" + billId + "_" + safeNum + ".pdf";
    }
}
