package com.example.app.session;

import com.example.app.company.Company;
import com.example.app.common.BaseEntity;
import jakarta.persistence.*;
import java.util.ArrayList;
import java.util.List;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "session_type",
        uniqueConstraints = @UniqueConstraint(columnNames = { "company_id", "name" })
)
public class SessionType extends BaseEntity {
    @ManyToOne(optional = false)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @Column(nullable = false)
    private String name;
    private String description;

    /**
     * How long a booked session of this type should be (minutes).
     * If missing/older rows, treat as 60 minutes at the API layer.
     */
    @Column
    private Integer durationMinutes;

    /**
     * Optional cool-down / cleanup time after the session (minutes).
     * This time stays unavailable for new bookings but is rendered separately from the booked block.
     */
    @Column
    private Integer breakMinutes;

    /**
     * Optional cap for how many participants can attend one session of this type.
     * When null, no explicit capacity rule is enforced.
     */
    @Column
    private Integer maxParticipantsPerSession;

    /**
     * When enabled, the public website widget may expose already-scheduled group sessions
     * of this service type so visitors can join them directly.
     */
    @Column(nullable = false)
    private boolean widgetGroupBookingEnabled = false;

    @Column(name = "guest_booking_enabled", nullable = false)
    private boolean guestBookingEnabled = true;

    @Column(name = "guest_booking_description", columnDefinition = "TEXT")
    private String guestBookingDescription;

    @Column(name = "guest_sort_order", nullable = false)
    private int guestSortOrder = 0;

    @OneToMany(mappedBy = "sessionType", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<TypeTransactionService> linkedServices = new ArrayList<>();
}
