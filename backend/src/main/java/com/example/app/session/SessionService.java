package com.example.app.session;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

/**
 * One ordered service segment inside a booked session.
 *
 * <p>The parent {@link SessionBooking} remains the backwards-compatible booking container while
 * this entity stores the complete service chain. Snapshot fields ensure that later edits to a
 * service type do not change the timing and labels of an existing booking.</p>
 */
@Getter
@Setter
@Entity
@Table(
        name = "session_service",
        uniqueConstraints = @UniqueConstraint(
                name = "ux_session_service_booking_position",
                columnNames = {"session_booking_id", "position"}
        )
)
public class SessionService extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_booking_id", nullable = false)
    private SessionBooking sessionBooking;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "session_type_id", nullable = false)
    private SessionType sessionType;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "space_id")
    private Space space;

    @Column(nullable = false)
    private int position;

    @Column(name = "start_time", nullable = false)
    private LocalDateTime startTime;

    @Column(name = "end_time", nullable = false)
    private LocalDateTime endTime;

    @Column(name = "service_name_snapshot", nullable = false, length = 255)
    private String serviceNameSnapshot;

    @Column(name = "color_snapshot", length = 20)
    private String colorSnapshot;

    @Column(name = "duration_minutes_snapshot", nullable = false)
    private int durationMinutesSnapshot;

    @Column(name = "break_minutes_snapshot", nullable = false)
    private int breakMinutesSnapshot;

    @Column(name = "price_calculation_mode_snapshot", nullable = false, length = 24)
    private String priceCalculationModeSnapshot;

    @Column(name = "service_group_id_snapshot")
    private Long serviceGroupIdSnapshot;

    @Column(name = "service_group_name_snapshot", length = 120)
    private String serviceGroupNameSnapshot;
}
