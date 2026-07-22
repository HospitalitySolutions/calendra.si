package com.example.app.demobooking;

import com.example.app.common.BaseEntity;
import com.example.app.user.User;
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
@Table(name = "platform_demo_bookings", uniqueConstraints = @UniqueConstraint(columnNames = "manage_token"))
public class DemoBooking extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "profile_id", nullable = false)
    private DemoBookingProfile profile;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "host_user_id", nullable = false)
    private User hostUser;

    @Column(name = "start_at", nullable = false)
    private Instant startAt;

    @Column(name = "end_at", nullable = false)
    private Instant endAt;

    @Column(nullable = false, length = 32)
    private String status = "CONFIRMED";

    @Column(name = "guest_name", nullable = false, length = 200)
    private String guestName;

    @Column(name = "guest_email", nullable = false, length = 320)
    private String guestEmail;

    @Column(name = "guest_phone", length = 80)
    private String guestPhone;

    @Column(name = "company_name", nullable = false, length = 240)
    private String companyName;

    @Column(name = "guest_note", length = 2000)
    private String guestNote;

    @Column(name = "guest_time_zone", nullable = false, length = 80)
    private String guestTimeZone;

    @Column(nullable = false, length = 8)
    private String locale = "sl";

    @Column(name = "meeting_provider", nullable = false, length = 24)
    private String meetingProvider;

    @Column(name = "meeting_join_url", length = 1000)
    private String meetingJoinUrl;

    @Column(name = "external_meeting_id", length = 255)
    private String externalMeetingId;

    @Column(name = "calendar_block_id")
    private Long calendarBlockId;

    @Column(name = "session_booking_id")
    private Long sessionBookingId;

    @Column(name = "manage_token", nullable = false, length = 100)
    private String manageToken;

    @Column(name = "utm_source", length = 200)
    private String utmSource;

    @Column(name = "utm_medium", length = 200)
    private String utmMedium;

    @Column(name = "utm_campaign", length = 200)
    private String utmCampaign;

    @Column(name = "cancelled_at")
    private Instant cancelledAt;

    @Column(name = "reminder_24h_sent_at")
    private Instant reminder24hSentAt;

    @Column(name = "reminder_1h_sent_at")
    private Instant reminder1hSentAt;
}
