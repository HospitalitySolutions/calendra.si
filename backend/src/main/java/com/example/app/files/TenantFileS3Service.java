package com.example.app.files;

import com.example.app.billing.InvoiceS3Properties;
import com.example.app.client.Client;
import com.example.app.company.ClientCompany;
import com.example.app.company.Company;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.core.ResponseBytes;
import software.amazon.awssdk.core.exception.SdkClientException;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest;
import software.amazon.awssdk.services.s3.model.ListObjectVersionsRequest;
import software.amazon.awssdk.services.s3.model.ListObjectVersionsResponse;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.GetObjectResponse;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.S3Exception;

@Service
public class TenantFileS3Service {
    private static final Logger log = LoggerFactory.getLogger(TenantFileS3Service.class);
    private static final Pattern SANITIZE_SEGMENT = Pattern.compile("[^a-zA-Z0-9._-]");
    /** Max upload size for client and company file attachments (must stay in sync with {@code spring.servlet.multipart.max-file-size}). */
    private static final long MAX_FILE_SIZE_BYTES = 50L * 1024L * 1024L;
    private static final long GUEST_PROFILE_PICTURE_MAX_BYTES = 5L * 1024L * 1024L;
    private static final long GUEST_APP_ASSET_MAX_BYTES = 10L * 1024L * 1024L;
    private static final long LOCATION_PUBLIC_LOGO_MAX_BYTES = 5L * 1024L * 1024L;

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
        return uploadWithLimit(key, file, MAX_FILE_SIZE_BYTES);
    }

    public StoredS3File uploadCompanyFile(Company tenant, ClientCompany company, MultipartFile file) {
        String key = buildCompanyObjectKey(tenant, company.getId(), file == null ? null : file.getOriginalFilename());
        return uploadWithLimit(key, file, MAX_FILE_SIZE_BYTES);
    }

    /** Guest profile avatars (not tied to a tenant); max size enforced by caller policy. */
    public StoredS3File uploadGuestProfilePicture(long guestUserId, MultipartFile file) {
        String key = basePrefix() + "/guestprofiles/" + guestUserId + "/" + storedFileName(file.getOriginalFilename());
        return uploadWithLimit(key, file, GUEST_PROFILE_PICTURE_MAX_BYTES);
    }

    public StoredS3File uploadGuestAppAsset(Company tenant, MultipartFile file) {
        String key = basePrefix() + "/" + safeTenantCode(tenant) + "/guestApp/" + storedFileName(file == null ? null : file.getOriginalFilename());
        return uploadWithLimit(key, file, GUEST_APP_ASSET_MAX_BYTES, "inline");
    }

    public StoredS3File uploadUserAvatar(Company tenant, long userId, MultipartFile file) {
        String key = basePrefix() + "/" + safeTenantCode(tenant) + "/users/" + userId + "/" + storedFileName(file == null ? null : file.getOriginalFilename());
        return uploadWithLimit(key, file, GUEST_PROFILE_PICTURE_MAX_BYTES, "inline");
    }

    /** Public-facing logo override for one physical location. */
    public StoredS3File uploadLocationPublicLogo(Company tenant, long locationId, MultipartFile file) {
        String key = basePrefix() + "/" + safeTenantCode(tenant) + "/locations/" + locationId
                + "/public-logo/" + storedFileName(file == null ? null : file.getOriginalFilename());
        return uploadWithLimit(key, file, LOCATION_PUBLIC_LOGO_MAX_BYTES, "inline");
    }

    public String publicUrlFor(String objectKey, String awsRegion) {
        String key = objectKey == null ? "" : objectKey.replaceAll("^/+", "");
        if (key.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File key is required.");
        }
        String explicitBase = properties.getPublicBaseUrl() == null ? "" : properties.getPublicBaseUrl().trim();
        if (!explicitBase.isBlank()) {
            return explicitBase.replaceAll("/+$", "") + "/" + key;
        }
        String region = (awsRegion == null || awsRegion.isBlank()) ? "eu-central-1" : awsRegion.trim();
        return "https://" + requireBucket() + ".s3." + region + ".amazonaws.com/" + key;
    }

    public byte[] download(String objectKey) {
        return downloadFile(objectKey).bytes();
    }

    public StoredS3File downloadFile(String objectKey) {
        S3Client client = requireClient();
        try {
            ResponseBytes<GetObjectResponse> response = client.getObjectAsBytes(
                    GetObjectRequest.builder()
                            .bucket(requireBucket())
                            .key(objectKey)
                            .build());
            byte[] bytes = response.asByteArray();
            String contentType = normalizeContentType(response.response().contentType());
            return new StoredS3File(objectKey, contentType, bytes.length, bytes);
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

    /**
     * Permanently deletes one object, including every historical version and delete marker when bucket versioning is enabled.
     * This method is intentionally strict and is used by irreversible Platform Admin tenant deletion.
     */
    public void deletePermanently(String objectKey) {
        if (objectKey == null || objectKey.isBlank()) {
            return;
        }
        S3Client client = requireClient();
        String bucket = requireBucket();
        String key = objectKey.trim();
        deleteCurrentObjects(client, bucket, key, true);
        deleteObjectVersions(client, bucket, key, true);
    }

    /**
     * Permanently removes every S3 object owned by one tenant. Invoice PDFs, attachments, avatars, guest-app
     * assets and location logos all share this prefix. Historical object versions are removed too.
     */
    public void deleteTenantDataPermanently(Company tenant) {
        if (!properties.isEnabled()) {
            return;
        }
        S3Client client = requireClient();
        String bucket = requireBucket();
        String prefix = basePrefix() + "/" + safeTenantCode(tenant) + "/";
        deleteCurrentObjects(client, bucket, prefix, false);
        deleteObjectVersions(client, bucket, prefix, false);
    }

    private void deleteCurrentObjects(S3Client client, String bucket, String keyOrPrefix, boolean exactKey) {
        Set<String> objectKeys = new LinkedHashSet<>();
        String continuationToken = null;
        do {
            ListObjectsV2Request request = ListObjectsV2Request.builder()
                    .bucket(bucket)
                    .prefix(keyOrPrefix)
                    .continuationToken(continuationToken)
                    .build();
            ListObjectsV2Response response;
            try {
                response = client.listObjectsV2(request);
            } catch (S3Exception ex) {
                throw s3DeletionFailure("listing tenant objects", "s3:ListBucket", ex);
            } catch (SdkClientException ex) {
                throw s3ClientDeletionFailure("listing tenant objects", ex);
            }
            response.contents().stream()
                    .map(object -> object.key())
                    .filter(key -> !exactKey || keyOrPrefix.equals(key))
                    .forEach(objectKeys::add);
            continuationToken = Boolean.TRUE.equals(response.isTruncated()) ? response.nextContinuationToken() : null;
        } while (continuationToken != null && !continuationToken.isBlank());

        for (String key : objectKeys) {
            try {
                client.deleteObject(DeleteObjectRequest.builder().bucket(bucket).key(key).build());
            } catch (S3Exception ex) {
                throw s3DeletionFailure("deleting tenant objects", "s3:DeleteObject", ex);
            } catch (SdkClientException ex) {
                throw s3ClientDeletionFailure("deleting tenant objects", ex);
            }
        }
    }

    private void deleteObjectVersions(S3Client client, String bucket, String keyOrPrefix, boolean exactKey) {
        List<VersionedObject> versions = new ArrayList<>();
        String keyMarker = null;
        String versionIdMarker = null;
        do {
            ListObjectVersionsRequest request = ListObjectVersionsRequest.builder()
                    .bucket(bucket)
                    .prefix(keyOrPrefix)
                    .keyMarker(keyMarker)
                    .versionIdMarker(versionIdMarker)
                    .build();
            ListObjectVersionsResponse response;
            try {
                response = client.listObjectVersions(request);
            } catch (S3Exception ex) {
                throw s3DeletionFailure("listing tenant object versions", "s3:ListBucketVersions", ex);
            } catch (SdkClientException ex) {
                throw s3ClientDeletionFailure("listing tenant object versions", ex);
            }
            response.versions().stream()
                    .filter(version -> !exactKey || keyOrPrefix.equals(version.key()))
                    .map(version -> new VersionedObject(version.key(), version.versionId()))
                    .forEach(versions::add);
            response.deleteMarkers().stream()
                    .filter(marker -> !exactKey || keyOrPrefix.equals(marker.key()))
                    .map(marker -> new VersionedObject(marker.key(), marker.versionId()))
                    .forEach(versions::add);
            if (Boolean.TRUE.equals(response.isTruncated())) {
                keyMarker = response.nextKeyMarker();
                versionIdMarker = response.nextVersionIdMarker();
            } else {
                keyMarker = null;
                versionIdMarker = null;
            }
        } while (keyMarker != null || versionIdMarker != null);

        for (VersionedObject version : versions) {
            try {
                client.deleteObject(DeleteObjectRequest.builder()
                        .bucket(bucket)
                        .key(version.key())
                        .versionId(version.versionId())
                        .build());
            } catch (S3Exception ex) {
                throw s3DeletionFailure("deleting tenant object versions", "s3:DeleteObjectVersion", ex);
            } catch (SdkClientException ex) {
                throw s3ClientDeletionFailure("deleting tenant object versions", ex);
            }
        }
    }

    private ResponseStatusException s3DeletionFailure(String operation, String requiredPermission, S3Exception ex) {
        String errorCode = ex.awsErrorDetails() == null ? null : ex.awsErrorDetails().errorCode();
        boolean accessDenied = ex.statusCode() == 403 || "AccessDenied".equalsIgnoreCase(errorCode);
        String codeSuffix = errorCode == null || errorCode.isBlank() ? "" : " (" + errorCode + ")";
        String message;
        if (accessDenied) {
            message = "S3 access was denied while " + operation + codeSuffix
                    + ". Required IAM permission: " + requiredPermission + ".";
        } else {
            message = "S3 failed while " + operation + codeSuffix
                    + " (HTTP " + ex.statusCode() + "). Required IAM permission: " + requiredPermission + ".";
        }
        return new ResponseStatusException(HttpStatus.BAD_GATEWAY, message, ex);
    }

    private ResponseStatusException s3ClientDeletionFailure(String operation, SdkClientException ex) {
        return new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "S3 could not be reached while " + operation + ". Check AWS credentials, region/network access and retry.",
                ex);
    }

    private record VersionedObject(String key, String versionId) {}

    private StoredS3File uploadWithLimit(String objectKey, MultipartFile file, long maxBytes) {
        return uploadWithLimit(objectKey, file, maxBytes, "attachment");
    }

    private StoredS3File uploadWithLimit(String objectKey, MultipartFile file, long maxBytes, String contentDisposition) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is required.");
        }
        if (file.getSize() > maxBytes) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "File is too large.");
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
                            .contentDisposition(contentDisposition)
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
