package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

/** Personal calendar block: blocks time for the owner only, not stored as a booked session. */
@Getter
@Setter
@JsonIgnoreProperties({"passwordHash", "preferredSlots", "assignedTo", "spaces", "types", "consultant", "company"})
@Entity
public class PersonalCalendarBlock extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false)
    private User owner;

    @Column(nullable = false)
    private LocalDateTime startTime;

    @Column(nullable = false)
    private LocalDateTime endTime;

    /** Display name shown on the calendar. */
    @Column(nullable = false, length = 200)
    private String task;

    @Column(length = 1000)
    private String notes;
}
