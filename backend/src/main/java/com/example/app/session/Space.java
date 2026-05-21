package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import lombok.Getter;
import lombok.Setter;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

@Getter
@Setter
@Entity
@Table(
        name = "space",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id", "name" })
)
public class Space extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String name;
    private String description;
}
