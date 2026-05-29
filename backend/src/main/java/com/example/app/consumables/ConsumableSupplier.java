package com.example.app.consumables;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.consumables.ConsumableEnums.SupplierStatus;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "consumable_supplier",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id", "name" })
)
public class ConsumableSupplier extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false, length = 180)
    private String name;

    @Column(length = 160)
    private String contactName;

    @Column(length = 80)
    private String phone;

    @Column(length = 180)
    private String email;

    @Column(length = 255)
    private String categories;

    @Column(nullable = false)
    private int paymentTermsDays = 30;

    @Column(nullable = false)
    private int reliabilityPercent = 100;

    @Column(precision = 19, scale = 4)
    private BigDecimal outstandingAmount = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private SupplierStatus status = SupplierStatus.ACTIVE;
}
