package com.example.app.guest.model;

import com.example.app.client.Client;
import com.example.app.common.BaseEntity;
import com.example.app.company.Company;
import com.example.app.session.SessionBooking;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.Index;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;
import java.time.LocalDateTime;
import lombok.Getter;
import lombok.Setter;

@Getter
@Setter
@Entity
@Table(
        name = "booking_push_reminders",
        uniqueConstraints = @UniqueConstraint(name = "ux_booking_push_reminders_booking_guest", columnNames = {"booking_id", "guest_user_id"}),
        indexes = {
                @Index(name = "idx_booking_push_reminders_due", columnList = "status,due_at,id"),
                @Index(name = "idx_booking_push_reminders_guest_status", columnList = "guest_user_id,status,due_at"),
                @Index(name = "idx_booking_push_reminders_booking", columnList = "booking_id")
        }
)
public class BookingPushReminder extends BaseEntity {
    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "booking_id", nullable = false)
    private SessionBooking booking;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "guest_user_id", nullable = false)
    private GuestUser guestUser;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "company_id", nullable = false)
    private Company company;

    @ManyToOne(optional = false, fetch = FetchType.LAZY)
    @JoinColumn(name = "client_id", nullable = false)
    private Client client;

    @Column(name = "due_at", nullable = false)
    private LocalDateTime dueAt;

    @Column(name = "booking_start_at", nullable = false)
    private LocalDateTime bookingStartAt;

    @Column(name = "reminder_minutes", nullable = false)
    private int reminderMinutes;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 16)
    private BookingPushReminderStatus status = BookingPushReminderStatus.PENDING;

    @Column(name = "sent_at")
    private LocalDateTime sentAt;

    @Column(name = "failed_at")
    private LocalDateTime failedAt;

    @Column(nullable = false)
    private int attempts = 0;

    @Column(name = "last_error", length = 1000)
    private String lastError;
}
