package com.example.app.workspaceclient;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.user.User;
import com.example.app.workspace.Workspace;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "workspace_client_audit_log")
public class WorkspaceClientAuditLog extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id")
    private User actor;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_company_id")
    private Company actorCompany;

    @Column(nullable = false, length = 48)
    private String action;

    @Column(name = "workspace_client_id")
    private Long workspaceClientId;

    @Column(name = "related_workspace_client_id")
    private Long relatedWorkspaceClientId;

    @Column(name = "client_id")
    private Long clientId;

    @Column(name = "details_json", nullable = false, columnDefinition = "TEXT")
    private String detailsJson = "{}";
}
