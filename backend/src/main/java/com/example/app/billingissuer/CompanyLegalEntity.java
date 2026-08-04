package com.example.app.billingissuer;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "company_legal_entities", uniqueConstraints = @UniqueConstraint(columnNames = {"company_id", "legal_entity_id"}))
public class CompanyLegalEntity extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false)
    @JoinColumn(name = "legal_entity_id", nullable = false)
    private LegalEntity legalEntity;

    @Column(name = "default_issuer", nullable = false)
    private boolean defaultIssuer;
    @Column(nullable = false)
    private boolean active = true;

    @ManyToOne
    @JoinColumn(name = "default_invoice_series_id")
    private InvoiceSeries defaultInvoiceSeries;
}
