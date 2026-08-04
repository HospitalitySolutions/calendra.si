package com.example.app.workspaceclient;

import java.util.List;
import java.util.Optional;
import org.springframework.data.jpa.repository.EntityGraph;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface WorkspaceClientDuplicateCandidateRepository extends JpaRepository<WorkspaceClientDuplicateCandidate, Long> {
    @EntityGraph(attributePaths = {"workspace", "left", "left.workspace", "right", "right.workspace", "reviewedBy"})
    @Query("""
            select c from WorkspaceClientDuplicateCandidate c
            where c.workspace.id = :workspaceId and c.status = :status
            order by c.score desc, c.createdAt asc, c.id asc
            """)
    List<WorkspaceClientDuplicateCandidate> findAllByWorkspaceAndStatus(
            @Param("workspaceId") Long workspaceId,
            @Param("status") DuplicateReviewStatus status);

    @EntityGraph(attributePaths = {"workspace", "left", "right"})
    Optional<WorkspaceClientDuplicateCandidate> findByIdAndWorkspaceId(Long id, Long workspaceId);

    Optional<WorkspaceClientDuplicateCandidate> findByWorkspaceIdAndLeftIdAndRightId(
            Long workspaceId, Long leftId, Long rightId);

    @Query("""
            select c from WorkspaceClientDuplicateCandidate c
            where c.workspace.id = :workspaceId
              and c.status = com.example.app.workspaceclient.DuplicateReviewStatus.PENDING
              and (c.left.id = :workspaceClientId or c.right.id = :workspaceClientId)
            """)
    List<WorkspaceClientDuplicateCandidate> findPendingInvolving(
            @Param("workspaceId") Long workspaceId,
            @Param("workspaceClientId") Long workspaceClientId);
}
