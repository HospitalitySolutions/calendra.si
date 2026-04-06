package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
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

    @ManyToOne(optional = false)
    private Client client;

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
}
