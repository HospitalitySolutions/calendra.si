package com.example.app.company;

import com.example.app.common.BaseEntity;
import com.example.app.workspace.Workspace;
import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.PrePersist;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
public class Company extends BaseEntity {
    @ManyToOne(cascade = { CascadeType.PERSIST, CascadeType.MERGE })
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private String name;

    @Column(name = "tenant_code", unique = true, length = 64)
    private String tenantCode;

    @Column(name = "workspace_public_booking_enabled", nullable = false)
    private boolean workspacePublicBookingEnabled = true;

    @Column(name = "paypal_merchant_id", length = 255)
    private String paypalMerchantId;

    @Column(name = "paypal_tracking_id", length = 255)
    private String paypalTrackingId;

    @Column(name = "paypal_onboarding_status", length = 64)
    private String paypalOnboardingStatus;

    @Column(name = "paypal_payments_receivable")
    private Boolean paypalPaymentsReceivable;

    @Column(name = "paypal_primary_email_confirmed")
    private Boolean paypalPrimaryEmailConfirmed;

    @PrePersist
    void ensureWorkspaceBeforePersist() {
        if (workspace != null) {
            return;
        }
        Workspace defaultWorkspace = new Workspace();
        defaultWorkspace.setName(name == null || name.isBlank() ? "Workspace" : name.trim());
        defaultWorkspace.setActive(true);
        workspace = defaultWorkspace;
    }

}