package com.example.app.consumables;

import com.example.app.billing.TaxRate;
import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.consumables.ConsumableEnums.QuantityMode;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionType;
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
        name = "session_consumable",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id", "booking_group_key", "consumable_id" })
)
public class SessionConsumable extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "session_booking_id", nullable = false)
    private SessionBooking sessionBooking;

    @Column(name = "booking_group_key", nullable = false, length = 64)
    private String bookingGroupKey;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "service_type_id")
    private SessionType serviceType;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "consumable_id", nullable = false)
    private Consumable consumable;

    /** Immutable article-name snapshot used for historical billing. */
    @Column(name = "item_name_snapshot", nullable = false, length = 160)
    private String itemNameSnapshot;

    /** Base quantity. PER_PARTICIPANT rows are multiplied by the current active participant count when stock is reconciled. */
    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal quantity = BigDecimal.ZERO;

    @Column(nullable = false, length = 32)
    private String unit = "kos";

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private QuantityMode quantityMode = QuantityMode.PER_SESSION;

    @Column(nullable = false, precision = 19, scale = 4)
    private BigDecimal costPriceSnapshot = BigDecimal.ZERO;

    @Column(precision = 19, scale = 4)
    private BigDecimal salePriceSnapshot;

    /** VAT captured with the appointment so later catalogue changes cannot rewrite billing history. */
    @Enumerated(EnumType.STRING)
    @Column(name = "vat_rate_snapshot", nullable = false, length = 32)
    private TaxRate vatRateSnapshot = TaxRate.NO_VAT;

    @Column(nullable = false)
    private boolean billable = false;

    @Column(nullable = false, length = 32)
    private String source = "SERVICE_TYPE_DEFAULT";

    @Column(nullable = false)
    private boolean manuallyChanged = false;

    @Column(columnDefinition = "TEXT")
    private String notes;
}
