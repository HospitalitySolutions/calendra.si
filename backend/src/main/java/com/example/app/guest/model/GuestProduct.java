package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import com.example.app.course.Course;
import com.example.app.billing.TransactionService;
import com.example.app.company.Company;
import com.example.app.location.Location;
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

    /** Transaction service used for invoicing guest product purchases such as gift cards. */
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
}
