package com.example.app.billingissuer;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.workspace.Workspace;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "invoice_series", uniqueConstraints = @UniqueConstraint(columnNames = {"legal_entity_id", "name"}))
public class InvoiceSeries extends BaseEntity {
    @JsonIgnore
    @ManyToOne(optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @ManyToOne(optional = false)
    @JoinColumn(name = "legal_entity_id", nullable = false)
    private LegalEntity legalEntity;

    @ManyToOne
    @JoinColumn(name = "company_id")
    private Company company;

    @ManyToOne
    @JoinColumn(name = "location_id")
    private Location location;

    @Column(nullable = false)
    private String name;
    @Column(name = "next_number", nullable = false)
    private String nextNumber = "1";
    @Column(name = "initial_number", nullable = false)
    private String initialNumber = "1";
    @Enumerated(EnumType.STRING)
    @Column(name = "reset_policy", nullable = false, length = 16)
    private InvoiceSeriesResetPolicy resetPolicy = InvoiceSeriesResetPolicy.NONE;
    @Column(name = "last_reset_year")
    private Integer lastResetYear;
    @Column(name = "business_premise_code", length = 64)
    private String businessPremiseCode;
    @Column(name = "electronic_device_id", length = 64)
    private String electronicDeviceId;
    @Column(nullable = false)
    private boolean active = true;
}
