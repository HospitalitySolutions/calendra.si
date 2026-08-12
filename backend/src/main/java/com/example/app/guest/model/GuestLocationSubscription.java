package com.example.app.guest.model;

import com.example.app.common.BaseEntity;
import com.example.app.location.Location;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "guest_location_subscriptions",
        uniqueConstraints = @UniqueConstraint(columnNames = {"guest_tenant_link_id", "location_id"})
)
public class GuestLocationSubscription extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "guest_tenant_link_id", nullable = false)
    private GuestTenantLink tenantLink;

    @ManyToOne(optional = false)
    @JoinColumn(name = "location_id", nullable = false)
    private Location location;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private GuestTenantLinkStatus status = GuestTenantLinkStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(name = "joined_via", nullable = false, length = 32)
    private GuestJoinMethod joinedVia = GuestJoinMethod.TENANT_CODE;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt = Instant.now();

    @Column(name = "last_used_at")
    private Instant lastUsedAt;
}
