package com.example.app.workspacesubscription;

import com.example.app.auth.LoginAccount;
import com.example.app.common.BaseEntity;
import com.example.app.user.User;
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
@Table(name = "workspace_subscription_audit_log")
public class WorkspaceSubscriptionAuditLog extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_subscription_id", nullable = false)
    private WorkspaceSubscription subscription;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_login_account_id")
    private LoginAccount actorLoginAccount;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "actor_membership_id")
    private User actorMembership;

    @Column(nullable = false, length = 80)
    private String action;

    @Column(columnDefinition = "text")
    private String details;
}
