package com.example.app.waitlist;

import com.example.app.common.BaseEntity;
import jakarta.persistence.*;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.LocalTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "waitlist_request_windows", indexes = @Index(name = "idx_waitlist_window_request", columnList = "waitlist_request_id"))
public class WaitlistRequestWindow extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "waitlist_request_id", nullable = false)
    private WaitlistRequest request;

    @Enumerated(EnumType.STRING)
    @Column(name = "day_of_week", length = 16)
    private DayOfWeek dayOfWeek;

    private LocalDate date;

    @Column(name = "time_from")
    private LocalTime timeFrom;

    @Column(name = "time_to")
    private LocalTime timeTo;

    @Column(name = "all_day", nullable = false)
    private boolean allDay;
}
