package com.example.app.course;

import com.example.app.common.BaseEntity;
import com.example.app.guest.model.GuestEntitlement;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.FetchType;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "course_access_progress",
        uniqueConstraints = @UniqueConstraint(name = "uk_course_access_progress_entitlement_course", columnNames = {"entitlement_id", "course_id"})
)
public class CourseAccessProgress extends BaseEntity {
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "entitlement_id", nullable = false)
    private GuestEntitlement entitlement;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "course_id", nullable = false)
    private Course course;

    @Column(name = "position_seconds", nullable = false)
    private int positionSeconds = 0;

    @Column(name = "duration_seconds")
    private Integer durationSeconds;

    @Column(name = "progress_percent", nullable = false)
    private double progressPercent = 0;

    @Column(nullable = false)
    private boolean completed = false;

    @Column(name = "last_played_at")
    private Instant lastPlayedAt;
}
