package com.example.app.monitoring;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "scheduled_job_alert_states",
        indexes = {
                @Index(name = "idx_scheduled_job_alert_states_status", columnList = "status,last_detected_at"),
                @Index(name = "idx_scheduled_job_alert_states_job_status", columnList = "job_name,status"),
                @Index(name = "idx_scheduled_job_alert_states_job_type_status", columnList = "job_name,alert_type,status")
        })
public class ScheduledJobAlertState extends BaseEntity {

    @Column(name = "job_name", nullable = false, length = 120)
    private String jobName;

    @Enumerated(EnumType.STRING)
    @Column(name = "alert_type", nullable = false, length = 48)
    private ScheduledJobAlertType alertType;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ScheduledJobAlertStatus status;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    private ScheduledJobAlertSeverity severity;

    @Column(name = "first_detected_at", nullable = false)
    private Instant firstDetectedAt;

    @Column(name = "last_detected_at", nullable = false)
    private Instant lastDetectedAt;

    @Column(name = "resolved_at")
    private Instant resolvedAt;

    @Column(name = "last_email_sent_at")
    private Instant lastEmailSentAt;

    @Column(name = "last_recovery_email_sent_at")
    private Instant lastRecoveryEmailSentAt;

    @Column(name = "last_run_id")
    private Long lastRunId;

    @Column(columnDefinition = "TEXT")
    private String message;
}
