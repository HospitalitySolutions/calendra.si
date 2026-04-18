package com.example.app.session;

import com.example.app.company.ClientCompany;
import com.example.app.company.Company;
import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.group.ClientGroup;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.LocalDate;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Getter
@Setter
@JsonIgnoreProperties({"passwordHash", "preferredSlots", "assignedTo", "spaces", "types", "consultant", "client", "bill", "items", "company"})
@Entity
public class SessionBooking extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    /** Null allowed for group sessions until participants are added. */
    @ManyToOne(optional = true)
    @JoinColumn(name = "client_id", nullable = true)
    private Client client;

    /**
     * Stable key shared by all booking rows that belong to the same logical session.
     * Enables multiple clients in one session while keeping downstream per-client rows.
     */
    @Column(name = "booking_group_key", length = 64)
    private String bookingGroupKey;

    /** Null = unassigned (admin-only pool in Bookings mode). */
    @ManyToOne(optional = true)
    @JoinColumn(name = "consultant_id", nullable = true)
    private User consultant;

    @Column(nullable = false)
    private LocalDateTime startTime;

    @Column(nullable = false)
    private LocalDateTime endTime;

    @ManyToOne
    private Space space;

    @ManyToOne
    private SessionType type;

    @Column(length = 1000)
    private String notes;

    /** Zoom or other online meeting URL for online sessions. */
    @Column(length = 500)
    private String meetingLink;

    /** Meeting provider: "zoom" or "google". Used to show correct link label. */
    @Column(length = 20)
    private String meetingProvider;

    /** When set, this session has been billed and should not create new open bills. */
    private LocalDate billedAt;

    /** When set, reminder (email/SMS) has been sent for this session. */
    private LocalDateTime reminderSentAt;

    /** When set, configured "before session" template notification was sent (see NOTIFICATION_SETTINGS_JSON). */
    private LocalDateTime notificationBeforeSentAt;

    /** When set, configured "after session" template notification was sent. */
    private LocalDateTime notificationAfterSentAt;

    @Column(name = "booking_status", length = 32)
    private String bookingStatus = "CONFIRMED";

    @Column(name = "source_channel", length = 32)
    private String sourceChannel = "STAFF";

    @Column(name = "source_order_id", length = 64)
    private String sourceOrderId;

    @Column(name = "guest_user_id", length = 64)
    private String guestUserId;

    @ManyToOne
    @JoinColumn(name = "client_group_id")
    private ClientGroup clientGroup;

    /**
     * When set, overrides {@link ClientGroup#getEmail()} for this session only (billing/UI).
     * Does not change the persisted {@link ClientGroup} row.
     */
    @Column(name = "session_group_email_override", length = 512)
    private String sessionGroupEmailOverride;

    /**
     * When set, overrides {@link ClientGroup#getBillingCompany()} for this session only.
     */
    @ManyToOne
    @JoinColumn(name = "session_group_billing_company_id")
    private ClientCompany sessionGroupBillingCompany;
}
