package com.example.app.session;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.location.Location;
import com.example.app.user.User;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/** A short-lived public booking hold created when a guest reaches payment/review. */
@Getter
@Setter
@Entity
@Table(name = "booking_slot_holds", uniqueConstraints = @UniqueConstraint(columnNames = "hold_token"))
public class BookingSlotHold extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "location_id", nullable = false)
    private Location location;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "consultant_id")
    private User consultant;

    @Column(name = "group_session_id")
    private Long groupSessionId;

    @Column(name = "slot_start", nullable = false)
    private LocalDateTime slotStart;

    /** End of the visible service block. */
    @Column(name = "slot_end", nullable = false)
    private LocalDateTime slotEnd;

    /** End of the occupied window, including the final service break. */
    @Column(name = "busy_end", nullable = false)
    private LocalDateTime busyEnd;

    @Column(name = "slot_id", nullable = false, length = 500)
    private String slotId;

    @Column(name = "hold_token", nullable = false, length = 100)
    private String holdToken;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
}
