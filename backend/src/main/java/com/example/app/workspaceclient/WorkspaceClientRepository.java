package com.example.app.workspaceclient;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkspaceClientRepository extends JpaRepository<WorkspaceClient, Long> {
    @EntityGraph(attributePaths = {"workspace", "mergedInto"})
    Optional<WorkspaceClient> findByIdAndWorkspaceId(Long id, Long workspaceId);

    @EntityGraph(attributePaths = {"workspace"})
    @Query("""
            select wc from WorkspaceClient wc
            where wc.workspace.id = :workspaceId
              and wc.status = com.example.app.workspaceclient.WorkspaceClientStatus.ACTIVE
              and (:search is null or :search = ''
                   or lower(wc.firstName) like lower(concat('%', :search, '%'))
                   or lower(wc.lastName) like lower(concat('%', :search, '%'))
                   or lower(concat(wc.firstName, ' ', wc.lastName)) like lower(concat('%', :search, '%'))
                   or lower(coalesce(wc.email, '')) like lower(concat('%', :search, '%'))
                   or lower(coalesce(wc.phone, '')) like lower(concat('%', :search, '%')))
            order by lower(wc.lastName), lower(wc.firstName), wc.id
            """)
    List<WorkspaceClient> searchActive(
            @Param("workspaceId") Long workspaceId,
            @Param("search") String search,
            Pageable pageable);

    @EntityGraph(attributePaths = {"workspace"})
    List<WorkspaceClient> findAllByWorkspaceIdAndStatusOrderByIdAsc(Long workspaceId, WorkspaceClientStatus status);

    @EntityGraph(attributePaths = {"workspace"})
    @Query("""
            select wc from WorkspaceClient wc
            where wc.workspace.id = :workspaceId
              and wc.status = com.example.app.workspaceclient.WorkspaceClientStatus.ACTIVE
              and wc.normalizedEmail = :normalizedEmail
              and wc.normalizedPhone = :normalizedPhone
              and lower(wc.firstName) = lower(:firstName)
              and lower(wc.lastName) = lower(:lastName)
            order by wc.id
            """)
    List<WorkspaceClient> findExactActiveIdentity(
            @Param("workspaceId") Long workspaceId,
            @Param("normalizedEmail") String normalizedEmail,
            @Param("normalizedPhone") String normalizedPhone,
            @Param("firstName") String firstName,
            @Param("lastName") String lastName,
            Pageable pageable);

    List<WorkspaceClient> findAllByIdIn(Collection<Long> ids);
}
