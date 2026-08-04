package com.example.app.workspaceclient;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import com.example.app.workspace.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "workspace_client_duplicate_candidates",
        uniqueConstraints = @UniqueConstraint(
                name = "uq_workspace_client_duplicate_pair",
                columnNames = {"workspace_id", "left_workspace_client_id", "right_workspace_client_id"}
        )
)
public class WorkspaceClientDuplicateCandidate extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "left_workspace_client_id", nullable = false)
    private WorkspaceClient left;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "right_workspace_client_id", nullable = false)
    private WorkspaceClient right;

    @Column(nullable = false)
    private int score;

    @Column(name = "reasons_json", nullable = false, columnDefinition = "TEXT")
    private String reasonsJson = "[]";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private DuplicateReviewStatus status = DuplicateReviewStatus.PENDING;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "reviewed_by_user_id")
    private User reviewedBy;
}
