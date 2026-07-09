package com.example.app.customfield;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
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
        name = "custom_field_values",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_custom_field_values_definition_entity",
                columnNames = {"field_definition_id", "entity_id"}
        )
)
public class CustomFieldValue extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "field_definition_id", nullable = false)
    private CustomFieldDefinition fieldDefinition;

    @Enumerated(EnumType.STRING)
    @Column(name = "entity_type", nullable = false, length = 24)
    private CustomFieldAppliesTo entityType;

    @Column(nullable = false)
    private Long entityId;

    @Column(length = 4000)
    private String valueText;
}
