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
        name = "consumable_purchase_order_line",
        uniqueConstraints = @UniqueConstraint(columnNames = { "purchase_order_id", "consumable_id" })
)
public class ConsumablePurchaseOrderLine extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "purchase_order_id", nullable = false)
    private ConsumablePurchaseOrder purchaseOrder;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "consumable_id", nullable = false)
    private Consumable consumable;

    @Column(name = "item_name_snapshot", nullable = false, length = 180)
    private String itemNameSnapshot;

    @Column(name = "unit_snapshot", nullable = false, length = 32)
    private String unitSnapshot;

    @Column(name = "ordered_quantity", nullable = false, precision = 19, scale = 4)
    private BigDecimal orderedQuantity = BigDecimal.ZERO;

    @Column(name = "received_quantity", nullable = false, precision = 19, scale = 4)
    private BigDecimal receivedQuantity = BigDecimal.ZERO;

    @Column(name = "unit_price", nullable = false, precision = 19, scale = 4)
    private BigDecimal unitPrice = BigDecimal.ZERO;

    @Enumerated(EnumType.STRING)
    @Column(name = "vat_rate", nullable = false, length = 24)
    private TaxRate vatRate = TaxRate.NO_VAT;
}
