package com.example.app.workspaceservice;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.session.SessionType;
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
@Table(name = "workspace_service_audit_log")
public class WorkspaceServiceAuditLog extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id")
    private User actor;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_company_id")
    private Company actorCompany;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_service_template_id")
    private WorkspaceServiceTemplate workspaceServiceTemplate;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_type_id")
    private SessionType sessionType;
    @Column(nullable = false, length = 48)
    private String action;
    @Column(name = "details_json", nullable = false, columnDefinition = "TEXT")
    private String detailsJson = "{}";
}
