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
@Table(name = "waitlist_offers", indexes = {
        @Index(name = "idx_waitlist_offer_company_status_expiry", columnList = "company_id,status,expires_at"),
        @Index(name = "idx_waitlist_offer_request", columnList = "waitlist_request_id,offered_at")
})
public class WaitlistOffer extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "waitlist_request_id", nullable = false)
    private WaitlistRequest request;

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
    private WaitlistOfferStatus status = WaitlistOfferStatus.PENDING;

    @Column(name = "offered_at", nullable = false)
    private Instant offeredAt;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "accepted_at")
    private Instant acceptedAt;

    @Column(name = "declined_at")
    private Instant declinedAt;

    @Column(name = "expiring_notified_at")
    private Instant expiringNotifiedAt;

    @Column(name = "secure_token_hash", nullable = false, length = 128)
    private String secureTokenHash;

    @Version
    @Column(nullable = false)
    private long version;
}
