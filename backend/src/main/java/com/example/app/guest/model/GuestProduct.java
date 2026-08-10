package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import com.example.app.course.Course;
import com.example.app.billing.TransactionService;
import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.session.ServiceGroup;
import com.example.app.session.SessionType;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.util.LinkedHashSet;
import java.util.Set;
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

    /** Shared definition is usable at every branch unless an explicit allowlist is configured. */
    @Column(name = "available_all_locations", nullable = false)
    private boolean availableAllLocations = true;

    @ManyToMany
    @JoinTable(
            name = "guest_product_locations",
            joinColumns = @JoinColumn(name = "product_id"),
            inverseJoinColumns = @JoinColumn(name = "location_id")
    )
    @OrderBy("name ASC, id ASC")
    private Set<Location> locations = new LinkedHashSet<>();

    @ManyToOne
    @JoinColumn(name = "session_type_id")
    private SessionType sessionType;

    /**
     * Booking services covered by this wallet product. When this set has rows it is the
     * authoritative service scope. The legacy {@code sessionType} field is retained as
     * a primary/fallback service for backwards compatibility and older integrations.
     * An empty set together with a null legacy service means the entitlement is valid
     * for every service (currently used by unrestricted memberships).
     */
    @ManyToMany
    @JoinTable(
            name = "guest_product_session_types",
            joinColumns = @JoinColumn(name = "product_id"),
            inverseJoinColumns = @JoinColumn(name = "session_type_id")
    )
    @OrderBy("name ASC, id ASC")
    private Set<SessionType> eligibleSessionTypes = new LinkedHashSet<>();

    /**
     * Optional dynamic service-group scope. When set, the entitlement is valid for every
     * service that currently belongs to this group. The explicit eligibleSessionTypes set is
     * still kept as a snapshot/fallback so historical products remain safe if a group is later
     * removed.
     */
    @ManyToOne
    @JoinColumn(name = "service_group_id")
    private ServiceGroup serviceGroup;

    /** Transaction service used for invoicing wallet product purchases. */
    @ManyToOne
    @JoinColumn(name = "transaction_service_id")
    private TransactionService transactionService;

    @ManyToOne
    @JoinColumn(name = "course_id")
    private Course course;

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

    /** Gift-card redemption semantics. Null for non-voucher products. */
    @Enumerated(EnumType.STRING)
    @Column(name = "voucher_redemption_mode", length = 16)
    private VoucherRedemptionMode voucherRedemptionMode;

    /** Which services a voucher may be used for. Null for non-voucher products. */
    @Enumerated(EnumType.STRING)
    @Column(name = "voucher_service_scope", length = 32)
    private VoucherServiceScope voucherServiceScope;

    /** Monetary face value for VALUE vouchers. Kept separate from the selling price. */
    @Column(name = "voucher_face_value_gross", precision = 12, scale = 2)
    private BigDecimal voucherFaceValueGross;

    /** Eligible services when voucherServiceScope == SELECTED_SERVICES. */
    @ManyToMany
    @JoinTable(
            name = "guest_product_voucher_session_types",
            joinColumns = @JoinColumn(name = "product_id"),
            inverseJoinColumns = @JoinColumn(name = "session_type_id")
    )
    @OrderBy("name ASC, id ASC")
    private Set<SessionType> voucherSessionTypes = new LinkedHashSet<>();

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

    /** Returns whether this product may cover the supplied booking service. */
    public boolean allowsSessionType(SessionType candidate) {
        if (candidate == null || candidate.getId() == null) return false;
        if (serviceGroup != null && serviceGroup.getId() != null) {
            ServiceGroup candidateGroup = candidate.getServiceGroup();
            return candidateGroup != null
                    && java.util.Objects.equals(serviceGroup.getId(), candidateGroup.getId());
        }
        return allowsSessionType(candidate.getId());
    }

    /** Returns whether this product may cover the supplied booking service id. */
    public boolean allowsSessionType(Long sessionTypeId) {
        if (sessionTypeId == null) return false;
        if (eligibleSessionTypes != null && !eligibleSessionTypes.isEmpty()) {
            return eligibleSessionTypes.stream()
                    .filter(java.util.Objects::nonNull)
                    .map(SessionType::getId)
                    .filter(java.util.Objects::nonNull)
                    .anyMatch(sessionTypeId::equals);
        }
        return sessionType == null || java.util.Objects.equals(sessionType.getId(), sessionTypeId);
    }
}
