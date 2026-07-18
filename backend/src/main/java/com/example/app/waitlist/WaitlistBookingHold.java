package com.example.app.waitlist;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.session.SessionBooking;
import com.example.app.session.Space;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "waitlist_booking_holds", indexes = @Index(name = "idx_waitlist_hold_active_slot", columnList = "company_id,status,slot_start,slot_end"))
public class WaitlistBookingHold extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @OneToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "offer_id", nullable = false, unique = true)
    private WaitlistOffer offer;

    @Column(name = "slot_start", nullable = false)
    private LocalDateTime slotStart;

    @Column(name = "slot_end", nullable = false)
    private LocalDateTime slotEnd;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "employee_id")
    private User employee;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "room_id")
    private Space room;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "session_id")
    private SessionBooking session;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private WaitlistHoldStatus status = WaitlistHoldStatus.ACTIVE;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Version
    @Column(nullable = false)
    private long version;
}
