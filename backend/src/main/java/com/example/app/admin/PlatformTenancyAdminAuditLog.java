package com.example.app.admin;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "platform_tenancy_admin_audit_logs",
        indexes = {@Index(name = "idx_pt_audit_company_created", columnList = "company_id,created_at")})
public class PlatformTenancyAdminAuditLog extends BaseEntity {

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_user_id", nullable = false)
    private User actorUser;

    /** Stable code, e.g. {@code CHANGE_PLAN}, {@code PRICE_OVERRIDE}. */
    @Column(nullable = false, length = 64)
    private String actionType;

    @Column(nullable = false, length = 500)
    private String summary;

    @Column(columnDefinition = "TEXT")
    private String detail;

    @Column(columnDefinition = "TEXT")
    private String reason;
}
