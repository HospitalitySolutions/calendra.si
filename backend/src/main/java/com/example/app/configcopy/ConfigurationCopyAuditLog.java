package com.example.app.configcopy;

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
@Table(name = "configuration_copy_audit_log")
public class ConfigurationCopyAuditLog extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "source_company_id", nullable = false)
    private Company sourceCompany;
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "target_company_id", nullable = false)
    private Company targetCompany;
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id")
    private User actor;
    @Column(name = "categories_json", nullable = false, columnDefinition = "TEXT")
    private String categoriesJson;
    @Column(name = "result_json", nullable = false, columnDefinition = "TEXT")
    private String resultJson;
}
