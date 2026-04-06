package com.example.app.fiscal;

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
@Table(
        name = "fiscal_certificates",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id" })
)
public class FiscalCertificate extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String fileName;

    @Column(nullable = false)
    private String contentType;

    // Use a dedicated bytea column; avoids Hibernate trying to cast legacy OID column in place.
    @Column(name = "certificate_data_bytes", columnDefinition = "bytea")
    private byte[] certificateData;
}
