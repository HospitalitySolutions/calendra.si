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

    /**
     * Stable key shared by all occurrences created from the same repeating booking action.
     * Each occurrence still has its own bookingGroupKey because a logical session may contain
     * multiple client rows.
     */
    @Column(name = "recurrence_series_key", length = 64)
    private String recurrenceSeriesKey;

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

    /** Historical service-group snapshot used by analytics even after regrouping. */
    @Column(name = "service_group_id_snapshot")
    private Long serviceGroupIdSnapshot;

    @Column(name = "service_group_name_snapshot", length = 120)
    private String serviceGroupNameSnapshot;

    @Column(name = "service_group_snapshot_captured", nullable = false)
    private boolean serviceGroupSnapshotCaptured = false;

    @PrePersist
    void snapshotServiceGroup() {
        if (serviceGroupSnapshotCaptured) return;
        ServiceGroup group = type == null ? null : type.getServiceGroup();
        serviceGroupIdSnapshot = group == null ? null : group.getId();
        serviceGroupNameSnapshot = group == null ? null : group.getName();
        serviceGroupSnapshotCaptured = true;
    }

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
    private String bookingStatus = SessionBookingStatus.RESERVED;

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

    /**
     * Session-specific payer override for this client row.
     * PERSON means the row client pays; COMPANY means sessionPayeeCompany pays.
     * Null keeps legacy/default billing behaviour for older rows.
     */
    @Column(name = "payee_type", length = 16)
    private String payeeType;

    @ManyToOne
    @JoinColumn(name = "payee_company_id")
    private ClientCompany payeeCompany;

    /** Session-only billing override. True means invoice/open-bill creation uses the fields below. */
    @Column(name = "payee_custom_data", nullable = false)
    private boolean payeeCustomData = false;

    @Column(name = "payee_person_first_name", length = 255)
    private String payeePersonFirstName;

    @Column(name = "payee_person_last_name", length = 255)
    private String payeePersonLastName;

    @Column(name = "payee_person_email", length = 512)
    private String payeePersonEmail;

    @Column(name = "payee_company_name", length = 255)
    private String payeeCompanyName;

    @Column(name = "payee_company_address", length = 512)
    private String payeeCompanyAddress;

    @Column(name = "payee_company_city", length = 255)
    private String payeeCompanyCity;

    @Column(name = "payee_company_postal_code", length = 64)
    private String payeeCompanyPostalCode;

    @Column(name = "payee_company_vat_id", length = 64)
    private String payeeCompanyVatId;

    @Column(name = "payee_company_email", length = 512)
    private String payeeCompanyEmail;
}
