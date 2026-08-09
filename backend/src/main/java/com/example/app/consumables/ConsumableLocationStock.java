package com.example.app.consumables;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.location.Location;
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

/**
 * Physical stock state for one shared consumable SKU at one operating Location.
 *
 * Consumable remains the company-wide catalog identity. All mutable inventory
 * quantities and valuation/reorder settings live here so two branches never
 * mutate the same company-wide stock counter.
 */
@Getter
@Setter
@Entity
@Table(
        name = "consumable_location_stock",
        uniqueConstraints = @UniqueConstraint(columnNames = { "consumable_id", "location_id" })
)
public class ConsumableLocationStock extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "consumable_id", nullable = false)
    private Consumable consumable;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "location_id", nullable = false)
    private Location location;

    @Column(name = "current_stock", nullable = false, precision = 19, scale = 4)
    private BigDecimal currentStock = BigDecimal.ZERO;

    @Column(name = "minimum_stock", nullable = false, precision = 19, scale = 4)
    private BigDecimal minimumStock = BigDecimal.ZERO;

    @Column(name = "cost_price", nullable = false, precision = 19, scale = 4)
    private BigDecimal costPrice = BigDecimal.ZERO;
}
