package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import com.example.app.session.SessionBooking;
import com.example.app.user.User;
import jakarta.persistence.*;
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
}
