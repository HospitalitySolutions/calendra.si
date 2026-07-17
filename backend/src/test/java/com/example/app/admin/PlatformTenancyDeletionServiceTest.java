package com.example.app.admin;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.company.CompanyRepository;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import jakarta.persistence.EntityManager;
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

    private PlatformTenancyDeletionService service;

    private User actor;

    @BeforeEach
    void setUp() {
        service = new PlatformTenancyDeletionService(companies, users, tenancyAdminAuditLogs, jdbc, entityManager);
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
        when(jdbc.update(anyString(), anyLong())).thenReturn(1);

        service.deleteTenancy(7L, actor, "Demo tenant removal");

        ArgumentCaptor<PlatformTenancyAdminAuditLog> auditCaptor = ArgumentCaptor.forClass(PlatformTenancyAdminAuditLog.class);
        verify(tenancyAdminAuditLogs).saveAndFlush(auditCaptor.capture());
        PlatformTenancyAdminAuditLog audit = auditCaptor.getValue();
        assertEquals("DELETE_TENANT", audit.getActionType());
        assertEquals("Demo tenant removal", audit.getReason());
        assertEquals(tenant, audit.getCompany());

        verify(entityManager).detach(audit);
        verify(jdbc, atLeastOnce()).update(anyString(), eq(7L));
        verify(jdbc, atLeastOnce()).update(anyString(), eq("CALENDRA-SUBSCRIPTION:7"));
        verify(companies).delete(tenant);
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
        verify(tenancyAdminAuditLogs).saveAndFlush(any());
        verify(companies, never()).delete(any());
    }
}
