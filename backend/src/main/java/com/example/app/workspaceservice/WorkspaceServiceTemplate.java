package com.example.app.workspaceservice;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
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
@Table(name = "workspace_service_templates")
public class WorkspaceServiceTemplate extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "owner_company_id", nullable = false)
    private Company ownerCompany;

    @Column(nullable = false)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(name = "default_duration_minutes")
    private Integer defaultDurationMinutes;

    @Column(length = 20)
    private String color;

    @Column(length = 80)
    private String icon;

    @Column(name = "booking_instructions", columnDefinition = "TEXT")
    private String bookingInstructions;

    @Column(nullable = false)
    private boolean active = true;
}
