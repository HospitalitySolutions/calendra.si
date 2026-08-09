package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import com.example.app.location.Location;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionService;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "guest_entitlement_usages")
public class GuestEntitlementUsage extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "entitlement_id", nullable = false)
    private GuestEntitlement entitlement;

    @ManyToOne(optional = true)
    @JoinColumn(name = "session_booking_id")
    private SessionBooking sessionBooking;

    /** Physical branch where this entitlement was consumed/validated. */
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "location_id", nullable = false)
    private Location location;

    /** Exact service line covered by this usage; null for legacy and whole-booking usages. */
    @ManyToOne(optional = true)
    @JoinColumn(name = "session_service_id")
    private SessionService sessionService;

    @Column(nullable = false)
    private int unitsUsed = 1;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 64)
    private EntitlementUsageReason reason = EntitlementUsageReason.BOOKING;

    @Column(nullable = false)
    private Instant usedAt = Instant.now();

    /** QR/manual scanner source for wallet-scanner usages; null for booking usages. */
    @Column(name = "scan_source", length = 16)
    private String scanSource;

    @ManyToOne
    @JoinColumn(name = "scanned_by_user_id")
    private User scannedBy;

    @Column(name = "units_before")
    private Integer unitsBefore;

    @Column(name = "units_after")
    private Integer unitsAfter;

    /** Open bill that was settled by this entitlement usage. Kept as an id because the open bill is deleted on settlement. */
    @Column(name = "source_open_bill_id")
    private Long sourceOpenBillId;

    /** Gross service value covered by this prepaid entitlement; this is not a new payment or invoice amount. */
    @Column(name = "covered_gross", precision = 12, scale = 2)
    private BigDecimal coveredGross;
}
