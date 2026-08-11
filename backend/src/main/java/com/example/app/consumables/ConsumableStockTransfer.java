package com.example.app.consumables;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
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
        name = "consumable_stock_transfer",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id", "idempotency_key" })
)
public class ConsumableStockTransfer extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "consumable_id", nullable = false)
    private Consumable consumable;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "from_location_id", nullable = false)
    private Location fromLocation;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "to_location_id", nullable = false)
    private Location toLocation;

    @Column(name = "item_name_snapshot", nullable = false, length = 180)
    private String itemNameSnapshot;

    @Column(name = "unit_snapshot", nullable = false, length = 32)
    private String unitSnapshot;

    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal quantity = BigDecimal.ZERO;

    @Column(name = "unit_cost_snapshot", nullable = false, precision = 19, scale = 4)
    private BigDecimal unitCostSnapshot = BigDecimal.ZERO;

    @Column(name = "value_amount", nullable = false, precision = 19, scale = 4)
    private BigDecimal valueAmount = BigDecimal.ZERO;

    @Column(name = "idempotency_key", nullable = false, length = 120)
    private String idempotencyKey;

    @Column(columnDefinition = "TEXT")
    private String note;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "created_by_id")
    private User createdBy;
}
