package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.common.BaseEntity;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import lombok.Getter;
import lombok.Setter;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@Getter
@Setter
@JsonIgnoreProperties({"passwordHash", "preferredSlots", "assignedTo", "spaces", "types", "client", "bill", "items"})
@Entity
public class BookableSlot extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DayOfWeek dayOfWeek;

    @Column(nullable = false)
    private LocalTime startTime;

    @Column(nullable = false)
    private LocalTime endTime;

    @ManyToOne(optional = false)
    private User consultant;

    @Column(nullable = false)
    private boolean indefinite = true;

    private LocalDate startDate;
    private LocalDate endDate;
}
