package com.example.app.google.calendar;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "google_calendar_sync_jobs",
        indexes = {
                @Index(name = "idx_google_cal_job_status_next", columnList = "status,next_attempt_at"),
                @Index(name = "idx_google_cal_job_entity", columnList = "company_id,app_entity_type,app_entity_id")
        })
public class GoogleCalendarSyncJob extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "connection_id")
    private GoogleCalendarConnection connection;

    @Enumerated(EnumType.STRING)
    @Column(name = "app_entity_type", length = 32)
    private GoogleCalendarEntityType appEntityType;

    @Column(name = "app_entity_id")
    private Long appEntityId;

    @Enumerated(EnumType.STRING)
    @Column(name = "action", nullable = false, length = 32)
    private GoogleCalendarSyncAction action;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private GoogleCalendarSyncJobStatus status = GoogleCalendarSyncJobStatus.PENDING;

    @Column(name = "attempts", nullable = false)
    private int attempts = 0;

    @Column(name = "next_attempt_at", nullable = false)
    private Instant nextAttemptAt = Instant.now();

    @Column(name = "last_error", length = 2000)
    private String lastError;
}
