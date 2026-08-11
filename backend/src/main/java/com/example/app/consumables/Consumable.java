package com.example.app.consumables;

import com.example.app.billing.TaxRate;
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
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "consumable",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id", "sku" })
)
public class Consumable extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    private ConsumableCategory category;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Column(length = 80)
    private String sku;

    @Column(length = 80)
    private String barcode;

    @Column(nullable = false, length = 32)
    private String unit = "kos";

    @Column(precision = 19, scale = 4)
    private BigDecimal salePrice;

    /** Legacy placeholder retained for backward compatibility with older API payloads. */
    @Column(name = "vat_rate_id")
    private Long vatRateId;

    @Enumerated(EnumType.STRING)
    @Column(name = "vat_rate", nullable = false, length = 32)
    private TaxRate vatRate = TaxRate.NO_VAT;

    @Column(nullable = false)
    private boolean trackStock = true;

    @Column(nullable = false)
    private boolean billable = false;

    @Column(nullable = false)
    private boolean active = true;
}
