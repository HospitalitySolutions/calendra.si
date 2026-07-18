package com.example.app.waitlist;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionType;
import com.example.app.session.Space;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import java.time.LocalDate;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "waitlist_requests", indexes = {
        @Index(name = "idx_waitlist_request_company_status", columnList = "company_id,status,joined_at"),
        @Index(name = "idx_waitlist_request_company_dates", columnList = "company_id,date_from,date_to"),
        @Index(name = "idx_waitlist_request_duplicate", columnList = "company_id,duplicate_key,status")
})
public class WaitlistRequest extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "client_id")
    private Client client;

    @Column(name = "guest_user_id")
    private Long guestUserId;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "service_id", nullable = false)
    private SessionType service;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "location_id")
    private Space location;

    @Enumerated(EnumType.STRING)
    @Column(name = "target_type", nullable = false, length = 32)
    private WaitlistTargetType targetType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "target_session_id")
    private SessionBooking targetSession;

    @Column(name = "date_from", nullable = false)
    private LocalDate dateFrom;

    @Column(name = "date_to", nullable = false)
    private LocalDate dateTo;

    @Enumerated(EnumType.STRING)
    @Column(name = "employee_preference_type", nullable = false, length = 24)
    private WaitlistEmployeePreferenceType employeePreferenceType = WaitlistEmployeePreferenceType.ANY;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "specific_employee_id")
    private User specificEmployee;

    @Column(name = "requested_participants", nullable = false)
    private int requestedParticipants = 1;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private WaitlistRequestStatus status = WaitlistRequestStatus.ACTIVE;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 24)
    private WaitlistSource source = WaitlistSource.STAFF;

    @Column(length = 2000)
    private String notes;

    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    @Column(name = "expires_at")
    private Instant expiresAt;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "booked_booking_id")
    private SessionBooking bookedBooking;

    @Column(name = "duplicate_key", nullable = false, length = 128)
    private String duplicateKey;

    @Version
    @Column(nullable = false)
    private long version;
}
