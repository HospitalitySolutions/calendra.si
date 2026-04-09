package com.example.app.files;

import com.example.app.billing.InvoiceS3Properties;
import com.example.app.client.Client;
import com.example.app.company.ClientCompany;
import com.example.app.company.Company;
import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;

@Service
public class TenantFileS3Service {
    private static final Logger log = LoggerFactory.getLogger(TenantFileS3Service.class);
    private static final Pattern SANITIZE_SEGMENT = Pattern.compile("[^a-zA-Z0-9._-]");
    private static final long MAX_FILE_SIZE_BYTES = 25L * 1024L * 1024L;

    private final InvoiceS3Properties properties;
    private final ObjectProvider<S3Client> s3ClientProvider;

    public TenantFileS3Service(InvoiceS3Properties properties, ObjectProvider<S3Client> s3ClientProvider) {
        this.properties = properties;
        this.s3ClientProvider = s3ClientProvider;
    }

    public boolean isReady() {
        return properties.isReady() && s3ClientProvider.getIfAvailable() != null;
    }

    public StoredS3File uploadClientFile(Company tenant, Client client, MultipartFile file) {
        String key = buildClientObjectKey(tenant, client.getId(), file == null ? null : file.getOriginalFilename());
        return upload(key, file);
    }

    public StoredS3File uploadCompanyFile(Company tenant, ClientCompany company, MultipartFile file) {
        String key = buildCompanyObjectKey(tenant, company.getId(), file == null ? null : file.getOriginalFilename());
        return upload(key, file);
    }

    public byte[] download(String objectKey) {
        S3Client client = requireClient();
        try {
            return client.getObjectAsBytes(
                            GetObjectRequest.builder()
                                    .bucket(requireBucket())
                                    .key(objectKey)
                                    .build())
                    .asByteArray();
        } catch (Exception e) {
            log.warn("Failed to download S3 object {}", objectKey, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to download file.");
        }
    }

    public void deleteQuietly(String objectKey) {
        if (objectKey == null || objectKey.isBlank() || !isReady()) {
            return;
        }
        try {
            requireClient().deleteObject(DeleteObjectRequest.builder().bucket(requireBucket()).key(objectKey).build());
        } catch (Exception e) {
            log.warn("Failed to delete S3 object {}", objectKey, e);
        }
    }

    private StoredS3File upload(String objectKey, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required.");
        }
        if (file.getSize() > MAX_FILE_SIZE_BYTES) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File must be smaller than 25 MB.");
        }
        S3Client client = requireClient();
        String contentType = normalizeContentType(file.getContentType());
        try {
            byte[] bytes = file.getBytes();
            client.putObject(
                    PutObjectRequest.builder()
                            .bucket(requireBucket())
                            .key(objectKey)
                            .contentType(contentType)
                            .contentDisposition("attachment")
                            .build(),
                    RequestBody.fromBytes(bytes));
            return new StoredS3File(objectKey, contentType, bytes.length, bytes);
        } catch (ResponseStatusException e) {
            throw e;
        } catch (Exception e) {
            log.warn("Failed to upload S3 object {}", objectKey, e);
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "Failed to upload file.");
        }
    }

    private String requireBucket() {
        if (properties.getBucket() == null || properties.getBucket().isBlank()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "File storage bucket is not configured.");
        }
        return properties.getBucket().trim();
    }

    private S3Client requireClient() {
        if (!properties.isEnabled()) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "File storage is disabled.");
        }
        S3Client client = s3ClientProvider.getIfAvailable();
        if (client == null) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "File storage client is unavailable.");
        }
        return client;
    }

    private String buildClientObjectKey(Company tenant, Long clientId, String originalFileName) {
        return basePrefix() + "/" + safeTenantCode(tenant) + "/clients/" + clientId + "/" + storedFileName(originalFileName);
    }

    private String buildCompanyObjectKey(Company tenant, Long companyId, String originalFileName) {
        return basePrefix() + "/" + safeTenantCode(tenant) + "/companies/" + companyId + "/" + storedFileName(originalFileName);
    }

    private String basePrefix() {
        String rawPrefix = properties.getPrefix() == null || properties.getPrefix().isBlank()
                ? "calendra/tenants"
                : properties.getPrefix().trim();
        return rawPrefix.replaceAll("^/+|/+$", "");
    }

    private String safeTenantCode(Company tenant) {
        String tenantCode = tenant == null ? null : tenant.getTenantCode();
        if (tenantCode == null || tenantCode.isBlank()) {
            return tenant != null && tenant.getId() != null ? String.valueOf(tenant.getId()) : "unknown";
        }
        return SANITIZE_SEGMENT.matcher(tenantCode.trim()).replaceAll("_");
    }

    private String storedFileName(String originalFileName) {
        String clean = sanitizeFileName(originalFileName);
        return System.currentTimeMillis() + "_" + UUID.randomUUID().toString().replace("-", "") + "_" + clean;
    }

    private String sanitizeFileName(String originalFileName) {
        String raw = originalFileName == null || originalFileName.isBlank() ? "file" : originalFileName.trim();
        String normalized = raw.replace(' ', '_');
        String cleaned = SANITIZE_SEGMENT.matcher(normalized).replaceAll("_");
        String lowered = cleaned.toLowerCase(Locale.ROOT);
        return lowered.isBlank() ? "file" : lowered;
    }

    private String normalizeContentType(String contentType) {
        if (contentType == null || contentType.isBlank()) {
            return "application/octet-stream";
        }
        return contentType.trim();
    }
}
