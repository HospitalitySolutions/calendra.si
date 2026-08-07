package com.example.app.activitylog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.example.app.company.Company;
import com.example.app.user.Role;
import com.example.app.user.User;
import com.example.app.workspace.Workspace;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.util.List;
import jakarta.persistence.criteria.CriteriaBuilder;
import jakarta.persistence.criteria.CriteriaQuery;
import jakarta.persistence.criteria.Path;
import jakarta.persistence.criteria.Predicate;
import jakarta.persistence.criteria.Root;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.mockito.Mockito;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.server.ResponseStatusException;

class ActivityLogControllerTest {

    @Test
    void adminCanListAndPageSizeIsClamped() {
        ActivityLogRepository repository = mock(ActivityLogRepository.class);
        ActivityLog row = row();
        when(repository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of(row)));
        ActivityLogController controller = new ActivityLogController(repository, new ObjectMapper());

        ActivityLogController.ActivityLogPage result = controller.list(
                admin(31L),
                "Janez",
                ActivityModule.CALENDAR,
                ActivityAction.SESSION_CREATED,
                ActivityActorType.USER,
                9L,
                300L,
                Instant.parse("2026-08-01T00:00:00Z"),
                Instant.parse("2026-08-31T23:59:59Z"),
                -5,
                1000
        );

        assertThat(result.content()).hasSize(1);
        assertThat(result.content().getFirst().details()).containsEntry("targetPath", "/calendar");

        ArgumentCaptor<Pageable> pageable = ArgumentCaptor.forClass(Pageable.class);
        verify(repository).findAll(any(Specification.class), pageable.capture());
        assertThat(pageable.getValue().getPageNumber()).isZero();
        assertThat(pageable.getValue().getPageSize()).isEqualTo(200);
        assertThat(pageable.getValue().getSort().getOrderFor("occurredAt")).isNotNull();
    }


    @Test
    @SuppressWarnings({"rawtypes", "unchecked"})
    void listSpecificationAlwaysPinsResultsToCurrentCompany() {
        ActivityLogRepository repository = mock(ActivityLogRepository.class);
        when(repository.findAll(any(Specification.class), any(Pageable.class)))
                .thenReturn(new PageImpl<>(List.of()));
        ActivityLogController controller = new ActivityLogController(repository, new ObjectMapper());

        controller.list(admin(31L), null, null, null, null, null, null, null, null, 0, 50);

        ArgumentCaptor<Specification<ActivityLog>> specification = ArgumentCaptor.forClass(Specification.class);
        verify(repository).findAll(specification.capture(), any(Pageable.class));

        Root<ActivityLog> root = mock(Root.class);
        CriteriaQuery<?> query = mock(CriteriaQuery.class);
        CriteriaBuilder cb = mock(CriteriaBuilder.class);
        Path companyPath = mock(Path.class);
        Predicate companyPredicate = mock(Predicate.class);
        Predicate combined = mock(Predicate.class);
        when(root.get("companyId")).thenReturn(companyPath);
        when(cb.equal(companyPath, 31L)).thenReturn(companyPredicate);
        when(cb.and(Mockito.<Predicate[]>any())).thenReturn(combined);

        Predicate result = specification.getValue().toPredicate(root, query, cb);

        assertThat(result).isSameAs(combined);
        verify(cb).equal(companyPath, 31L);
    }

    @Test
    void nonAdminCannotReadActivityLog() {
        ActivityLogController controller = new ActivityLogController(mock(ActivityLogRepository.class), new ObjectMapper());
        User employee = admin(31L);
        employee.setRole(Role.CONSULTANT);

        assertThatThrownBy(() -> controller.list(
                employee, null, null, null, null, null, null, null, null, 0, 50))
                .isInstanceOf(ResponseStatusException.class)
                .satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode()).isEqualTo(HttpStatus.FORBIDDEN));
    }

    @Test
    void activityLogControllerIsReadOnlyAtHttpBoundary() {
        assertThat(List.of(ActivityLogController.class.getDeclaredMethods()))
                .noneMatch(method -> method.isAnnotationPresent(PostMapping.class)
                        || method.isAnnotationPresent(PutMapping.class)
                        || method.isAnnotationPresent(PatchMapping.class)
                        || method.isAnnotationPresent(DeleteMapping.class));
    }

    private static User admin(Long companyId) {
        Workspace workspace = new Workspace();
        workspace.setId(21L);
        Company company = new Company();
        company.setId(companyId);
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

    private static ActivityLog row() {
        ActivityLog row = new ActivityLog();
        row.setId(1L);
        row.setWorkspaceId(21L);
        row.setCompanyId(31L);
        row.setActorType(ActivityActorType.USER);
        row.setActorUserId(9L);
        row.setActorNameSnapshot("David Mirc");
        row.setModule(ActivityModule.CALENDAR);
        row.setActionCode(ActivityAction.SESSION_CREATED);
        row.setEntityType("SESSION");
        row.setEntityId(100L);
        row.setEntityLabel("Pilates");
        row.setSummary("Created session");
        row.setSource("WEB_APP");
        row.setOccurredAt(Instant.parse("2026-08-07T12:00:00Z"));
        row.setDetailsJson("{\"targetPath\":\"/calendar\"}");
        return row;
    }
}
