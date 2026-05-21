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

    /**
     * Enables this service type in staff-created group booked sessions.
     * This is separate from website/guest app visibility flags.
     */
    @Column(name = "group_booking_enabled", nullable = false)
    private boolean groupBookingEnabled = false;

    /**
     * Newline-separated guest user emails that get reserved access to guest-app group sessions.
     * Empty/null means no reserved user allowlist.
     */
    @Column(name = "guest_limit_user_emails", columnDefinition = "TEXT")
    private String guestLimitUserEmails;

    @Enumerated(EnumType.STRING)
    @Column(name = "price_calculation_mode", nullable = false, length = 24)
    private SessionPriceCalculationMode priceCalculationMode = SessionPriceCalculationMode.PER_CLIENT;

    @Column(name = "guest_booking_description", columnDefinition = "TEXT")
    private String guestBookingDescription;

    @Column(name = "guest_sort_order", nullable = false)
    private int guestSortOrder = 0;

    @Column(nullable = false)
    private boolean active = true;

    @OneToMany(mappedBy = "sessionType", cascade = CascadeType.ALL, orphanRemoval = true)
    private List<TypeTransactionService> linkedServices = new ArrayList<>();
}
