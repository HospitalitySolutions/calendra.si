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
@Table(name = "google_calendar_event_links",
        indexes = {
                @Index(name = "idx_google_cal_link_company_entity", columnList = "company_id,app_entity_type,app_entity_id"),
                @Index(name = "idx_google_cal_link_google", columnList = "connection_id,calendar_id,google_event_id"),
                @Index(name = "idx_google_cal_link_origin", columnList = "origin")
        },
        uniqueConstraints = {
                @UniqueConstraint(name = "uk_google_cal_link_google", columnNames = {"connection_id", "calendar_id", "google_event_id"}),
                @UniqueConstraint(name = "uk_google_cal_link_entity", columnNames = {"connection_id", "company_id", "app_entity_type", "app_entity_id"})
        })
public class GoogleCalendarEventLink extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "connection_id", nullable = false)
    private GoogleCalendarConnection connection;

    @Column(name = "calendar_id", nullable = false, length = 1024)
    private String calendarId;

    @Column(name = "google_event_id", nullable = false, length = 1024)
    private String googleEventId;

    @Column(name = "google_etag", length = 512)
    private String googleEtag;

    @Column(name = "google_ical_uid", length = 512)
    private String googleIcalUid;

    @Column(name = "google_updated_at")
    private Instant googleUpdatedAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "app_entity_type", nullable = false, length = 32)
    private GoogleCalendarEntityType appEntityType;

    @Column(name = "app_entity_id", nullable = false)
    private Long appEntityId;

    @Enumerated(EnumType.STRING)
    @Column(name = "origin", nullable = false, length = 20)
    private GoogleCalendarEventOrigin origin = GoogleCalendarEventOrigin.CALENDRA;

    @Column(name = "sync_status", nullable = false, length = 32)
    private String syncStatus = "SYNCED";

    @Column(name = "last_error", length = 2000)
    private String lastError;

    @Column(name = "last_synced_hash", length = 128)
    private String lastSyncedHash;

    @Column(name = "last_synced_at")
    private Instant lastSyncedAt;

    @Column(name = "deleted_at")
    private Instant deletedAt;
}
