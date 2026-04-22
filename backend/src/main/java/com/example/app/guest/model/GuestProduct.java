package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.session.SessionType;
import jakarta.persistence.*;
import java.math.BigDecimal;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "guest_products")
public class GuestProduct extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne
    @JoinColumn(name = "session_type_id")
    private SessionType sessionType;

    @Column(nullable = false, length = 160)
    private String name;

    @Column(columnDefinition = "TEXT")
    private String description;

    /** Short badge label shown on the guest app Buy card (e.g. "Best value", "Available now"). */
    @Column(name = "promo_text", length = 120)
    private String promoText;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ProductType productType;

    @Column(nullable = false, precision = 12, scale = 2)
    private BigDecimal priceGross;

    @Column(nullable = false, length = 3)
    private String currency = "EUR";

    @Column(nullable = false)
    private boolean active = true;

    @Column(nullable = false)
    private boolean guestVisible = true;

    @Column(nullable = false)
    private boolean bookable = true;

    private Integer usageLimit;

    private Integer validityDays;

    @Column(nullable = false)
    private boolean autoRenews = false;

    @Column(nullable = false)
    private int sortOrder = 0;

    @Column(columnDefinition = "TEXT")
    private String bookingRulesJson;

    @Column(columnDefinition = "TEXT")
    private String entitlementRulesJson;
}
