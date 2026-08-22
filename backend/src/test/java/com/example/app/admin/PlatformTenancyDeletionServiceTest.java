package com.example.app.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.course.BunnyMediaService;
import com.example.app.files.TenantFileS3Service;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.persistence.EntityManager;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

@ExtendWith(MockitoExtension.class)
class PlatformTenancyDeletionServiceTest {

    @Mock
    private CompanyRepository companies;

    @Mock
    private UserRepository users;

    @Mock
    private PlatformTenancyAdminAuditLogRepository tenancyAdminAuditLogs;

    @Mock
    private JdbcTemplate jdbc;

    @Mock
    private EntityManager entityManager;

    @Mock
    private TenantFileS3Service fileStorage;

    @Mock
    private BunnyMediaService bunnyMediaService;

    private PlatformTenancyDeletionService service;

    private User actor;

    @BeforeEach
    void setUp() {
        service = new PlatformTenancyDeletionService(
                companies, users, tenancyAdminAuditLogs, jdbc, entityManager, fileStorage, bunnyMediaService);
        actor = new User();
        actor.setId(1L);
        actor.setEmail("admin@example.com");
    }

    @Test
    void assertDeletable_blocksPlatformAdminTenant() {
        Company platform = new Company();
        platform.setId(99L);
        platform.setName("Platform Admin");

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> PlatformTenancyDeletionService.assertDeletable(platform));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
    }

    @Test
    void deleteTenancy_notFoundWhenMissing() {
        when(companies.findById(404L)).thenReturn(Optional.empty());

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.deleteTenancy(404L, actor, "test"));
        assertEquals(HttpStatus.NOT_FOUND, ex.getStatusCode());
        verify(tenancyAdminAuditLogs, never()).saveAndFlush(any());
        verify(companies, never()).delete(any());
    }

    @Test
    void deleteTenancy_rejectsPlatformAdminCompany() {
        Company platform = new Company();
        platform.setId(1L);
        platform.setName("Platform Admin");
        when(companies.findById(1L)).thenReturn(Optional.of(platform));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.deleteTenancy(1L, actor, "cleanup"));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(tenancyAdminAuditLogs, never()).saveAndFlush(any());
        verify(companies, never()).delete(any());
    }

    @Test
    void deleteTenancy_recordsAuditPurgesDataAndDeletesCompany() {
        Company tenant = new Company();
        tenant.setId(7L);
        tenant.setName("Zoom Marketplace");
        when(companies.findById(7L)).thenReturn(Optional.of(tenant));
        when(users.getReferenceById(1L)).thenReturn(actor);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        service.deleteTenancy(7L, actor, "Demo tenant removal");

        ArgumentCaptor<PlatformTenancyAdminAuditLog> auditCaptor = ArgumentCaptor.forClass(PlatformTenancyAdminAuditLog.class);
        verify(tenancyAdminAuditLogs).saveAndFlush(auditCaptor.capture());
        PlatformTenancyAdminAuditLog audit = auditCaptor.getValue();
        assertEquals("DELETE_TENANT", audit.getActionType());
        assertEquals("Demo tenant removal", audit.getReason());
        assertEquals(tenant, audit.getCompany());

        verify(entityManager).detach(audit);
        verify(entityManager).detach(tenant);
        verify(jdbc, atLeastOnce()).update(anyString(), any(Object[].class));
        verify(fileStorage).deleteTenantDataPermanently(tenant);
        verify(companies, never()).delete(any());
    }


    @Test
    void deleteTenancy_neverReferencesRetiredSingularWaitlistTable() {
        Company tenant = new Company();
        tenant.setId(7L);
        tenant.setName("Current-schema tenant");
        when(companies.findById(7L)).thenReturn(Optional.of(tenant));
        when(users.getReferenceById(1L)).thenReturn(actor);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        service.deleteTenancy(7L, actor, "cleanup");

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbc, atLeastOnce()).update(sqlCaptor.capture(), any(Object[].class));
        List<String> sql = sqlCaptor.getAllValues();

        assertTrue(
                sql.stream().noneMatch(statement -> statement != null
                        && statement.matches("(?is).*\\bwaitlist_request\\b.*")),
                "Tenant deletion must not reference the retired singular waitlist_request table.");
    }

    @Test
    void deleteTenancy_clearsLocationIssuerBeforeDeletingLegalEntityAssignments() {
        Company tenant = new Company();
        tenant.setId(7L);
        tenant.setName("Issuer tenant");
        when(companies.findById(7L)).thenReturn(Optional.of(tenant));
        when(users.getReferenceById(1L)).thenReturn(actor);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        service.deleteTenancy(7L, actor, "cleanup");

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbc, atLeastOnce()).update(sqlCaptor.capture(), any(Object[].class));
        List<String> sql = sqlCaptor.getAllValues();

        int clearLocationIssuer = indexOfSql(sql, "UPDATE locations SET default_legal_entity_id = NULL");
        int legalAssignments = indexOfSql(sql, "DELETE FROM company_legal_entities");
        int invoiceSeries = indexOfSql(sql, "DELETE FROM invoice_series WHERE company_id = ?");
        int locations = indexOfSql(sql, "DELETE FROM locations WHERE company_id = ?");

        assertTrue(clearLocationIssuer >= 0, "Location issuer references must be cleared before deleting assignments.");
        assertTrue(legalAssignments > clearLocationIssuer, "Legal-entity assignments must be deleted after location issuer references are cleared.");
        assertTrue(invoiceSeries > legalAssignments, "Invoice series must be deleted after legal-entity assignments.");
        assertTrue(locations > invoiceSeries, "Locations must only be deleted after their invoice series are gone.");
    }

    @Test
    void deleteTenancy_purgesPlatformDemoHostReferencesBeforeDeletingUsers() {
        Company tenant = new Company();
        tenant.setId(7L);
        tenant.setName("Demo host tenant");
        when(companies.findById(7L)).thenReturn(Optional.of(tenant));
        when(users.getReferenceById(1L)).thenReturn(actor);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);

        service.deleteTenancy(7L, actor, "cleanup");

        ArgumentCaptor<String> sqlCaptor = ArgumentCaptor.forClass(String.class);
        verify(jdbc, atLeastOnce()).update(sqlCaptor.capture(), any(Object[].class));
        List<String> sql = sqlCaptor.getAllValues();

        int holds = indexOfSql(sql, "DELETE FROM platform_demo_booking_holds");
        int bookings = indexOfSql(sql, "DELETE FROM platform_demo_bookings");
        int profile = indexOfSql(sql, "UPDATE platform_demo_booking_profiles SET host_user_id = NULL");
        int usersDelete = indexOfSql(sql, "DELETE FROM users WHERE company_id = ?");

        assertTrue(holds >= 0, "Demo booking holds must be purged.");
        assertTrue(bookings > holds, "Demo bookings must be purged after holds.");
        assertTrue(profile > bookings, "Demo profile must be disabled after hosted bookings are removed.");
        assertTrue(usersDelete > profile, "Tenant users must only be deleted after demo host references are cleared.");
    }

    @Test
    void deleteTenancy_doesNotCommitCompanyDeleteWhenExternalStorageFails() {
        Company tenant = new Company();
        tenant.setId(7L);
        tenant.setName("Storage failure tenant");
        when(companies.findById(7L)).thenReturn(Optional.of(tenant));
        when(users.getReferenceById(1L)).thenReturn(actor);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        doThrow(new IllegalStateException("S3 unavailable")).when(fileStorage).deleteTenantDataPermanently(tenant);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.deleteTenancy(7L, actor, "cleanup"));

        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        verify(entityManager, never()).clear();
        verify(companies, never()).delete(any());
    }

    @Test
    void deleteTenancy_preservesExternalStorageDiagnosticForPlatformAdmin() {
        Company tenant = new Company();
        tenant.setId(7L);
        tenant.setName("Storage permission tenant");
        when(companies.findById(7L)).thenReturn(Optional.of(tenant));
        when(users.getReferenceById(1L)).thenReturn(actor);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1);
        doThrow(new ResponseStatusException(
                        HttpStatus.BAD_GATEWAY,
                        "S3 access was denied while listing tenant object versions. Required IAM permission: s3:ListBucketVersions."))
                .when(fileStorage)
                .deleteTenantDataPermanently(tenant);

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.deleteTenancy(7L, actor, "cleanup"));

        assertEquals(HttpStatus.BAD_GATEWAY, ex.getStatusCode());
        assertTrue(ex.getReason().contains("s3:ListBucketVersions"));
        assertTrue(ex.getReason().contains("No database deletion was committed"));
        verify(companies, never()).delete(any());
    }

    @Test
    void deleteTenancy_returnsConflictWhenActorIsMissing() {
        Company tenant = new Company();
        tenant.setId(7L);
        tenant.setName("Zoom Marketplace");
        when(companies.findById(7L)).thenReturn(Optional.of(tenant));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.deleteTenancy(7L, null, "cleanup"));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        verify(tenancyAdminAuditLogs, never()).saveAndFlush(any());
        verify(companies, never()).delete(any());
    }

    @Test
    void deleteTenancy_preservesUnexpectedRootCauseForPlatformAdmin() {
        Company tenant = new Company();
        tenant.setId(7L);
        tenant.setName("Broken schema tenant");
        when(companies.findById(7L)).thenReturn(Optional.of(tenant));
        when(users.getReferenceById(1L)).thenReturn(actor);
        when(jdbc.update(anyString(), any(Object[].class)))
                .thenThrow(new IllegalStateException("ERROR: relation tenant_dependency does not exist"));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.deleteTenancy(7L, actor, "cleanup"));

        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertTrue(ex.getReason().contains("relation tenant_dependency does not exist"));
        assertTrue(ex.getReason().contains("No database deletion was committed"));
    }

    @Test
    void deleteTenancy_mapsDataIntegrityViolationToConflict() {
        Company tenant = new Company();
        tenant.setId(7L);
        tenant.setName("Zoom Marketplace");
        when(companies.findById(7L)).thenReturn(Optional.of(tenant));
        when(users.getReferenceById(1L)).thenReturn(actor);
        when(jdbc.update(anyString(), any(Object[].class))).thenThrow(new DataIntegrityViolationException("fk"));

        ResponseStatusException ex =
                assertThrows(ResponseStatusException.class, () -> service.deleteTenancy(7L, actor, "cleanup"));
        assertEquals(HttpStatus.CONFLICT, ex.getStatusCode());
        assertEquals(
                "This tenant cannot be deleted because tenant data is still referenced by another record. No database deletion was committed.",
                ex.getReason());
        verify(tenancyAdminAuditLogs).saveAndFlush(any());
        verify(companies, never()).delete(any());
    }

    private static int indexOfSql(List<String> statements, String prefix) {
        for (int i = 0; i < statements.size(); i++) {
            if (statements.get(i) != null && statements.get(i).startsWith(prefix)) {
                return i;
            }
        }
        return -1;
    }
}
