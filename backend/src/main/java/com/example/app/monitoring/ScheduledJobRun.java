package com.example.app.monitoring;

import com.example.app.common.BaseEntity;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Index;
import jakarta.persistence.Table;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "scheduled_job_runs",
        indexes = {
                @Index(name = "idx_scheduled_job_runs_job_started", columnList = "job_name,started_at"),
                @Index(name = "idx_scheduled_job_runs_status_started", columnList = "status,started_at"),
                @Index(name = "idx_scheduled_job_runs_created", columnList = "created_at")
        })
public class ScheduledJobRun extends BaseEntity {

    @Column(name = "job_name", nullable = false, length = 120)
    private String jobName;

    @Column(nullable = false, length = 32)
    private String status;

    @Column(name = "started_at", nullable = false)
    private Instant startedAt;

    @Column(name = "finished_at")
    private Instant finishedAt;

    @Column(name = "duration_ms")
    private Long durationMs;

    @Column(name = "instance_id", length = 160)
    private String instanceId;

    @Column(name = "locked_by", length = 160)
    private String lockedBy;

    @Column(name = "records_processed")
    private Integer recordsProcessed;

    @Column(name = "error_message", columnDefinition = "TEXT")
    private String errorMessage;
}
