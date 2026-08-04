package com.example.app.billingissuer;

import com.example.app.common.BaseEntity;
import com.example.app.workspace.Workspace;
import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "legal_entities")
public class LegalEntity extends BaseEntity {
    @JsonIgnore
    @ManyToOne(optional = false)
    @JoinColumn(name = "workspace_id", nullable = false)
    private Workspace workspace;

    @Column(nullable = false)
    private String name;
    @Column(length = 512)
    private String address;
    @Column(name = "postal_code", length = 64)
    private String postalCode;
    private String city;
    @Column(nullable = false, length = 2)
    private String country = "SI";
    @Column(name = "tax_number", length = 64)
    private String taxNumber;
    @Column(name = "vat_id", length = 64)
    private String vatId;
    @Column(length = 128)
    private String iban;
    @Column(length = 64)
    private String bic;
    @Column(length = 320)
    private String email;
    @Column(length = 128)
    private String telephone;
    @Column(nullable = false, length = 3)
    private String currency = "EUR";
    @Column(name = "fiscal_environment", nullable = false, length = 16)
    private String fiscalEnvironment = "TEST";
    @Column(name = "software_supplier_tax_number", length = 64)
    private String softwareSupplierTaxNumber;
    @JsonIgnore
    @Column(name = "certificate_password_encrypted", columnDefinition = "text")
    private String certificatePasswordEncrypted;
    @Column(nullable = false)
    private boolean active = true;
}
