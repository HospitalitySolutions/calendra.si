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
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(name = "platform_demo_booking_profiles", uniqueConstraints = @UniqueConstraint(columnNames = "slug"))
public class DemoBookingProfile extends BaseEntity {
    @Column(nullable = false, length = 80)
    private String slug = "predstavitev";

    @Column(nullable = false, length = 200)
    private String title = "Predstavitev Calendre";

    @Column(nullable = false)
    private boolean enabled = false;

    @Column(nullable = false)
    private int durationMinutes = 30;

    @Column(nullable = false)
    private int slotStepMinutes = 30;

    @Column(nullable = false)
    private int bufferBeforeMinutes = 10;

    @Column(nullable = false)
    private int bufferAfterMinutes = 10;

    @Column(nullable = false)
    private int minimumNoticeMinutes = 1440;

    @Column(nullable = false)
    private int bookingHorizonDays = 30;

    @Column(nullable = false)
    private int maximumBookingsPerDay = 4;

    @Column(nullable = false, length = 80)
    private String timeZone = "Europe/Ljubljana";

    @Column(nullable = false, length = 24)
    private String meetingProvider = "GOOGLE_MEET";

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "host_user_id")
    private User hostUser;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String availabilityJson = "[{\"dayOfWeek\":\"MONDAY\",\"enabled\":true,\"start\":\"09:00\",\"end\":\"17:00\"},{\"dayOfWeek\":\"TUESDAY\",\"enabled\":true,\"start\":\"09:00\",\"end\":\"17:00\"},{\"dayOfWeek\":\"WEDNESDAY\",\"enabled\":true,\"start\":\"09:00\",\"end\":\"17:00\"},{\"dayOfWeek\":\"THURSDAY\",\"enabled\":true,\"start\":\"09:00\",\"end\":\"17:00\"},{\"dayOfWeek\":\"FRIDAY\",\"enabled\":true,\"start\":\"09:00\",\"end\":\"17:00\"}]";
}
