package com.example.app.google.calendar;

import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.user.User;
import jakarta.persistence.*;
import java.time.Instant;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "google_calendar_connections",
        indexes = {
                @Index(name = "idx_google_cal_conn_company", columnList = "company_id"),
                @Index(name = "idx_google_cal_conn_user", columnList = "user_id"),
                @Index(name = "idx_google_cal_conn_status", columnList = "status")
        })
public class GoogleCalendarConnection extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    private User user;

    @Column(name = "google_account_email", length = 512)
    private String googleAccountEmail;

    @Column(name = "calendar_id", nullable = false, length = 1024)
    private String calendarId = "primary";

    @Column(name = "calendar_summary", length = 512)
    private String calendarSummary;

    @Enumerated(EnumType.STRING)
    @Column(name = "sync_direction", nullable = false, length = 32)
    private GoogleCalendarSyncDirection syncDirection = GoogleCalendarSyncDirection.TWO_WAY;

    @Column(name = "allow_google_to_modify_bookings", nullable = false)
    private boolean allowGoogleToModifyBookings = false;

    @Enumerated(EnumType.STRING)
    @Column(name = "booking_delete_policy", nullable = false, length = 32)
    private GoogleCalendarBookingDeletePolicy bookingDeletePolicy = GoogleCalendarBookingDeletePolicy.MARK_CONFLICT;

    @Column(name = "import_google_events_as", nullable = false, length = 32)
    private String importGoogleEventsAs = "PERSONAL_BLOCK";

    @Column(name = "access_token", nullable = false, length = 4000)
    private String accessToken;

    @Column(name = "refresh_token", length = 4000)
    private String refreshToken;

    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;

    @Column(name = "scopes", length = 1000)
    private String scopes;

    @Column(name = "sync_token", length = 4000)
    private String syncToken;

    @Column(name = "channel_id", length = 128)
    private String channelId;

    @Column(name = "resource_id", length = 512)
    private String resourceId;

    @Column(name = "channel_expires_at")
    private Instant channelExpiresAt;

    @Column(name = "last_full_sync_at")
    private Instant lastFullSyncAt;

    @Column(name = "last_incremental_sync_at")
    private Instant lastIncrementalSyncAt;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 32)
    private GoogleCalendarConnectionStatus status = GoogleCalendarConnectionStatus.ACTIVE;

    @Column(name = "last_error", length = 2000)
    private String lastError;
}
