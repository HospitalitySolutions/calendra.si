package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import com.example.app.session.SessionBooking;
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

    @ManyToOne(optional = false)
    @JoinColumn(name = "session_booking_id", nullable = false)
    private SessionBooking sessionBooking;

    @Column(nullable = false)
    private int unitsUsed = 1;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 64)
    private EntitlementUsageReason reason = EntitlementUsageReason.BOOKING;

    @Column(nullable = false)
    private Instant usedAt = Instant.now();
}
