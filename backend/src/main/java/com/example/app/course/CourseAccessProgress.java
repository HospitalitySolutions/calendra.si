package com.example.app.course;

import com.example.app.common.BaseEntity;
import com.example.app.guest.model.GuestEntitlement;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "course_access_progress",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_course_access_progress_entitlement_course",
                columnNames = {"guest_entitlement_id", "course_id"}
        ),
        indexes = {
                @Index(name = "idx_course_access_progress_entitlement", columnList = "guest_entitlement_id"),
                @Index(name = "idx_course_access_progress_course", columnList = "course_id")
        }
)
public class CourseAccessProgress extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "guest_entitlement_id", nullable = false)
    private GuestEntitlement entitlement;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @Column(name = "position_seconds", nullable = false)
    private int positionSeconds = 0;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "progress_percent", nullable = false, precision = 5, scale = 2)
    private BigDecimal progressPercent = BigDecimal.ZERO;

    @Column(nullable = false)
    private boolean completed = false;

    @Column(name = "completed_at")
    private Instant completedAt;

    @Column(name = "last_played_at", nullable = false)
    private Instant lastPlayedAt = Instant.now();
}
