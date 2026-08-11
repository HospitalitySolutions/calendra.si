package com.example.app.consumables;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "consumable_inventory_line")
public class ConsumableInventoryLine extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "inventory_session_id", nullable = false)
    private ConsumableInventorySession inventorySession;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "consumable_id", nullable = false)
    private Consumable consumable;

    @Column(name = "item_name_snapshot", nullable = false, length = 180)
    private String itemNameSnapshot;

    @Column(name = "category_name_snapshot", length = 140)
    private String categoryNameSnapshot;

    @Column(name = "unit_snapshot", nullable = false, length = 32)
    private String unitSnapshot;

    @Column(name = "system_quantity", nullable = false, precision = 19, scale = 4)
    private BigDecimal systemQuantity = BigDecimal.ZERO;

    @Column(name = "counted_quantity", precision = 19, scale = 4)
    private BigDecimal countedQuantity;

    @Column(name = "cost_price_snapshot", nullable = false, precision = 19, scale = 4)
    private BigDecimal costPriceSnapshot = BigDecimal.ZERO;

    @Column(name = "counted_at")
    private Instant countedAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "counted_by_id")
    private User countedBy;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
