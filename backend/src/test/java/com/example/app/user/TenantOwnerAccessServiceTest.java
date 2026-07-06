package com.example.app.user;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class TenantOwnerAccessServiceTest {

    @Mock
    private UserRepository users;

    @Test
    void ensureTenantOwnerAdministratorDoesNotDowngradeSuperAdmin() {
        User platformAdmin = new User();
        platformAdmin.setId(1L);
        platformAdmin.setRole(Role.SUPER_ADMIN);
        platformAdmin.setActive(true);
        platformAdmin.setConsultant(false);

        when(users.findFirstByCompanyIdOrderByIdAsc(1L)).thenReturn(Optional.of(platformAdmin));

        TenantOwnerAccessService service = new TenantOwnerAccessService(users);

        Long ownerId = service.ensureTenantOwnerAdministrator(1L);

        assertEquals(1L, ownerId);
        assertEquals(Role.SUPER_ADMIN, platformAdmin.getRole());
        verify(users, never()).save(platformAdmin);
    }

    @Test
    void ensureTenantOwnerAdministratorPromotesNonAdminTenantOwner() {
        User tenantOwner = new User();
        tenantOwner.setId(2L);
        tenantOwner.setRole(Role.CONSULTANT);
        tenantOwner.setActive(true);

        when(users.findFirstByCompanyIdOrderByIdAsc(2L)).thenReturn(Optional.of(tenantOwner));

        TenantOwnerAccessService service = new TenantOwnerAccessService(users);

        Long ownerId = service.ensureTenantOwnerAdministrator(2L);

        assertEquals(2L, ownerId);
        assertEquals(Role.ADMIN, tenantOwner.getRole());
        verify(users).save(tenantOwner);
    }
}
