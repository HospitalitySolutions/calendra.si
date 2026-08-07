package com.example.app.activitylog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.client.Client;
import com.example.app.client.ClientAnonymizationService;
import com.example.app.client.ClientController;
import com.example.app.client.ClientRemovalGuard;
import com.example.app.client.ClientRepository;
import com.example.app.company.ClientCompanyRepository;
import com.example.app.company.Company;
import com.example.app.files.ClientFileRepository;
import com.example.app.files.TenantFileS3Service;
import com.example.app.guest.model.GuestEntitlementRepository;
import com.example.app.guest.model.GuestEntitlementUsageRepository;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.order.GuestEntitlementService;
import com.example.app.guest.order.GuestOrderService;
import com.example.app.session.SessionBookingRepository;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.user.UserRepository;
import com.example.app.workspace.Workspace;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

class ClientControllerActivityLogTest {

    @Test
    void creatingClientEmitsExactlyOneSemanticAuditEvent() {
        ClientRepository clients = mock(ClientRepository.class);
        ClientRemovalGuard removalGuard = mock(ClientRemovalGuard.class);
        GuestTenantLinkRepository guestTenantLinks = mock(GuestTenantLinkRepository.class);
        ActivityLogService activityLogs = mock(ActivityLogService.class);

        ClientController controller = new ClientController(
                clients,
                mock(UserRepository.class),
                mock(SessionBookingRepository.class),
                mock(ClientAnonymizationService.class),
                mock(ClientCompanyRepository.class),
                mock(ClientFileRepository.class),
                mock(TenantFileS3Service.class),
                mock(GuestEntitlementRepository.class),
                mock(GuestEntitlementUsageRepository.class),
                mock(GuestEntitlementService.class),
                guestTenantLinks,
                mock(GuestOrderService.class),
                removalGuard
        );
        ReflectionTestUtils.setField(controller, "activityLogs", activityLogs);

        User admin = admin();
        when(clients.save(any(Client.class))).thenAnswer(invocation -> {
            Client saved = invocation.getArgument(0);
            saved.setId(101L);
            return saved;
        });
        when(removalGuard.isRemovalBlocked(101L, 31L)).thenReturn(false);
        when(guestTenantLinks.existsByCompanyIdAndClientIdAndStatus(any(), any(), any())).thenReturn(false);

        ClientController.ClientRequest request = new ClientController.ClientRequest(
                "Janez",
                "Novak",
                "janez@example.com",
                "+38640111222",
                null,
                false,
                null,
                false,
                null,
                List.of(),
                null,
                false,
                false,
                false,
                null,
                List.of(),
                Map.of()
        );

        ClientController.ClientResponse response = controller.create(request, admin);

        assertThat(response.id()).isEqualTo(101L);
        assertThat(response.firstName()).isEqualTo("Janez");
        verify(activityLogs, times(1)).recordUser(
                eq(admin),
                eq(ActivityModule.CLIENTS),
                eq(ActivityAction.CLIENT_CREATED),
                eq("CLIENT"),
                eq(101L),
                eq("Janez Novak"),
                eq("Created client Janez Novak"),
                eq(null),
                eq(null),
                eq(Map.of("clientId", 101L))
        );
    }

    private static User admin() {
        Workspace workspace = new Workspace();
        workspace.setId(21L);
        Company company = new Company();
        company.setId(31L);
        company.setWorkspace(workspace);

        User user = new User();
        user.setId(9L);
        user.setCompany(company);
        user.setRole(Role.ADMIN);
        user.setFirstName("David");
        user.setLastName("Mirc");
        user.setEmail("david@example.com");
        return user;
    }
}
