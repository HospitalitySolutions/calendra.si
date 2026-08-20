package com.example.app.files;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.example.app.billing.InvoiceS3Properties;
import com.example.app.company.Company;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.ListObjectVersionsRequest;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Request;
import software.amazon.awssdk.services.s3.model.ListObjectsV2Response;
import software.amazon.awssdk.services.s3.model.S3Exception;

class TenantFileS3ServiceDeletionTest {

    private InvoiceS3Properties properties;
    private ObjectProvider<S3Client> clientProvider;
    private S3Client client;
    private TenantFileS3Service service;
    private Company tenant;

    @BeforeEach
    @SuppressWarnings("unchecked")
    void setUp() {
        properties = new InvoiceS3Properties();
        properties.setEnabled(true);
        properties.setBucket("calendra-test");
        properties.setPrefix("invoices");

        clientProvider = mock(ObjectProvider.class);
        client = mock(S3Client.class);
        when(clientProvider.getIfAvailable()).thenReturn(client);

        service = new TenantFileS3Service(properties, clientProvider);
        tenant = new Company();
        tenant.setId(7L);
        tenant.setTenantCode("tenant-7");
    }

    @Test
    void permanentTenantDelete_reportsListBucketPermissionWhenCurrentObjectListingIsDenied() {
        when(client.listObjectsV2(any(ListObjectsV2Request.class)))
                .thenThrow(S3Exception.builder().statusCode(403).message("Access Denied").build());

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> service.deleteTenantDataPermanently(tenant));

        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("s3:ListBucket"));
        assertTrue(ex.getReason().contains("access was denied"));
    }

    @Test
    void permanentTenantDelete_reportsListBucketVersionsPermissionWhenVersionListingIsDenied() {
        when(client.listObjectsV2(any(ListObjectsV2Request.class)))
                .thenReturn(ListObjectsV2Response.builder().isTruncated(false).build());
        when(client.listObjectVersions(any(ListObjectVersionsRequest.class)))
                .thenThrow(S3Exception.builder().statusCode(403).message("Access Denied").build());

        ResponseStatusException ex = assertThrows(
                ResponseStatusException.class,
                () -> service.deleteTenantDataPermanently(tenant));

        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("s3:ListBucketVersions"));
        assertTrue(ex.getReason().contains("object versions"));
    }
}
