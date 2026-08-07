package com.example.app.activitylog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.auth.LoginAccount;
import com.example.app.company.Company;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.workspace.Workspace;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

class ActivityLogServiceTest {
    private ActivityLogRepository repository;
    private ActivityLogService service;

    @BeforeEach
    void setUp() {
        repository = mock(ActivityLogRepository.class);
        when(repository.save(any(ActivityLog.class))).thenAnswer(invocation -> invocation.getArgument(0));
        service = new ActivityLogService(repository, new ObjectMapper());
    }

    @Test
    void recordUserCapturesTenantActorEntityAndStructuredDetails() throws Exception {
        User actor = user(9L, 21L, 31L, 41L, "David", "Mirc", "david@example.com");

        ActivityLog saved = service.recordUser(
                actor,
                ActivityModule.CALENDAR,
                ActivityAction.SESSION_PARTICIPANT_ADDED,
                "SESSION",
                100L,
                "Pilates 10:00",
                "CLIENT",
                200L,
                "Janez Novak",
                "Added Janez Novak to group session",
                300L,
                400L,
                ActivityDetails.of("participantCount", 8, "targetPath", "/calendar")
        );

        assertThat(saved.getWorkspaceId()).isEqualTo(21L);
        assertThat(saved.getCompanyId()).isEqualTo(31L);
        assertThat(saved.getLocationId()).isEqualTo(300L);
        assertThat(saved.getSpaceId()).isEqualTo(400L);
        assertThat(saved.getActorType()).isEqualTo(ActivityActorType.USER);
        assertThat(saved.getActorUserId()).isEqualTo(9L);
        assertThat(saved.getActorLoginAccountId()).isEqualTo(41L);
        assertThat(saved.getActorNameSnapshot()).isEqualTo("David Mirc");
        assertThat(saved.getModule()).isEqualTo(ActivityModule.CALENDAR);
        assertThat(saved.getActionCode()).isEqualTo(ActivityAction.SESSION_PARTICIPANT_ADDED);
        assertThat(saved.getEntityType()).isEqualTo("SESSION");
        assertThat(saved.getEntityId()).isEqualTo(100L);
        assertThat(saved.getSecondaryEntityType()).isEqualTo("CLIENT");
        assertThat(saved.getSecondaryEntityId()).isEqualTo(200L);
        assertThat(saved.getSource()).isEqualTo("WEB_APP");
        assertThat(saved.getOccurredAt()).isNotNull();

        Map<?, ?> details = new ObjectMapper().readValue(saved.getDetailsJson(), Map.class);
        assertThat(details).containsEntry("participantCount", 8);
        assertThat(details).containsEntry("targetPath", "/calendar");
        verify(repository).save(saved);
    }

    @Test
    void recordExternalCapturesNonHumanActorWithoutFabricatingAUser() {
        Company company = company(21L, 31L);

        ActivityLog saved = service.recordExternal(
                company,
                ActivityActorType.WEBSITE_WIDGET,
                "Website widget",
                "WEBSITE_WIDGET",
                ActivityModule.WEBSITE,
                ActivityAction.SESSION_CREATED,
                "SESSION",
                100L,
                "Massage 12:00",
                "CLIENT",
                200L,
                "Guest",
                "Website widget created booking",
                300L,
                400L,
                ActivityDetails.of("bookingSource", "WEBSITE")
        );

        assertThat(saved.getWorkspaceId()).isEqualTo(21L);
        assertThat(saved.getCompanyId()).isEqualTo(31L);
        assertThat(saved.getActorType()).isEqualTo(ActivityActorType.WEBSITE_WIDGET);
        assertThat(saved.getActorUserId()).isNull();
        assertThat(saved.getActorLoginAccountId()).isNull();
        assertThat(saved.getActorNameSnapshot()).isEqualTo("Website widget");
        assertThat(saved.getSource()).isEqualTo("WEBSITE_WIDGET");
    }

    @Test
    void fallsBackToEmailAndTrimsOversizedDisplayFields() {
        User actor = user(9L, 21L, 31L, 41L, " ", " ", " fallback@example.com ");
        String oversizedEntity = "X".repeat(500);
        String oversizedSummary = "Y".repeat(1200);

        ActivityLog saved = service.recordUser(
                actor,
                ActivityModule.CLIENTS,
                ActivityAction.CLIENT_UPDATED,
                "CLIENT",
                100L,
                oversizedEntity,
                oversizedSummary,
                null,
                null,
                Map.of()
        );

        assertThat(saved.getActorNameSnapshot()).isEqualTo("fallback@example.com");
        assertThat(saved.getEntityLabel()).hasSize(320);
        assertThat(saved.getSummary()).hasSize(1000);
        assertThat(saved.getDetailsJson()).isNull();
    }

    @Test
    void rejectsUserWithoutCompanyWorkspaceSoCrossTenantRowsCannotBeWritten() {
        User actor = new User();
        actor.setId(9L);
        actor.setCompany(new Company());

        assertThatThrownBy(() -> service.recordUser(
                actor,
                ActivityModule.CLIENTS,
                ActivityAction.CLIENT_CREATED,
                "CLIENT",
                100L,
                "Client",
                "Created client",
                null,
                null,
                Map.of()
        ))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("company/workspace");
    }

    private static User user(Long userId, Long workspaceId, Long companyId, Long loginAccountId,
                             String firstName, String lastName, String email) {
        User user = new User();
        user.setId(userId);
        user.setCompany(company(workspaceId, companyId));
        LoginAccount account = new LoginAccount();
        account.setId(loginAccountId);
        user.setLoginAccount(account);
        user.setFirstName(firstName);
        user.setLastName(lastName);
        user.setEmail(email);
        user.setRole(Role.ADMIN);
        return user;
    }

    private static Company company(Long workspaceId, Long companyId) {
        Workspace workspace = new Workspace();
        workspace.setId(workspaceId);
        Company company = new Company();
        company.setId(companyId);
        company.setWorkspace(workspace);
        return company;
    }
}
