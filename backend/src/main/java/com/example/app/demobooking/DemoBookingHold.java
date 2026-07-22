package com.example.app.demobooking;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "platform_demo_booking_holds", uniqueConstraints = @UniqueConstraint(columnNames = "hold_token"))
public class DemoBookingHold extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id", nullable = false)
    private DemoBookingProfile profile;

    @Column(name = "start_at", nullable = false)
    private Instant startAt;

    @Column(name = "end_at", nullable = false)
    private Instant endAt;

    @Column(name = "hold_token", nullable = false, length = 100)
    private String holdToken;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
}
