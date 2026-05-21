package com.example.app.settings;

import com.example.app.company.Company;
import com.example.app.common.BaseEntity;
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
        name = "app_settings",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id", "key" })
)
public class AppSetting extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String key;
    @Column(nullable = false, columnDefinition = "TEXT")
    private String value;
}
