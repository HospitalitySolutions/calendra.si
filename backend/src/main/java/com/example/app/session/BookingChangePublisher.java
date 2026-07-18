package com.example.app.session;

import com.example.app.google.calendar.GoogleCalendarEntityType;
import com.example.app.google.calendar.GoogleCalendarSyncQueueService;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.notifications.GuestPushService;
import com.example.app.guest.notifications.GuestBookingReminderService;
import com.example.app.notification.TenantNotificationService;
import com.example.app.waitlist.WaitlistService;
import java.time.LocalDateTime;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class BookingChangePublisher {
    private static final Logger log = LoggerFactory.getLogger(BookingChangePublisher.class);
    public static final String BOOKING_CREATED = "BOOKING_CREATED";
    public static final String BOOKING_UPDATED = "BOOKING_UPDATED";
    public static final String BOOKING_DELETED = "BOOKING_DELETED";
    public static final String BOOKING_RESCHEDULED = "BOOKING_RESCHEDULED";
    public static final String BOOKING_CANCELLED = "BOOKING_CANCELLED";
    public static final String BOOKING_SWAPPED = "BOOKING_SWAPPED";

    private final SessionBookingRealtimeService realtimeService;
    private final GuestTenantLinkRepository guestTenantLinks;
    private final GuestPushService guestPushService;
    private final SessionBookingRepository sessionBookings;
    private final GoogleCalendarSyncQueueService googleCalendarSyncQueueService;
    private final GuestBookingReminderService bookingReminderService;
    private final TenantNotificationService tenantNotificationService;

    @Autowired(required = false)
    private ObjectProvider<WaitlistService> waitlistServiceProvider;

    public BookingChangePublisher(
            SessionBookingRealtimeService realtimeService,
            GuestTenantLinkRepository guestTenantLinks,
            GuestPushService guestPushService,
            SessionBookingRepository sessionBookings,
            GoogleCalendarSyncQueueService googleCalendarSyncQueueService,
            GuestBookingReminderService bookingReminderService,
            TenantNotificationService tenantNotificationService
    ) {
        this.realtimeService = realtimeService;
        this.guestTenantLinks = guestTenantLinks;
        this.guestPushService = guestPushService;
        this.sessionBookings = sessionBookings;
        this.googleCalendarSyncQueueService = googleCalendarSyncQueueService;
        this.bookingReminderService = bookingReminderService;
        this.tenantNotificationService = tenantNotificationService;
    }

    public void publish(Long companyId, Long bookingId, LocalDateTime startTime, LocalDateTime endTime, String kind) {
        publish(companyId, bookingId, startTime, endTime, kind, null, null);
    }

    public void publish(Long companyId, Long bookingId, LocalDateTime startTime, LocalDateTime endTime, String kind, String origin, LocalDateTime previousStartTime) {
        if (companyId == null || bookingId == null || kind == null || kind.isBlank()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    safelyPublishAfterCommit(companyId, bookingId, startTime, endTime, kind, origin, previousStartTime);
                }
            });
            return;
        }
        safelyPublishAfterCommit(companyId, bookingId, startTime, endTime, kind, origin, previousStartTime);
    }

    private void safelyPublishAfterCommit(Long companyId, Long bookingId, LocalDateTime startTime, LocalDateTime endTime, String kind, String origin, LocalDateTime previousStartTime) {
        try {
            publishAfterCommit(companyId, bookingId, startTime, endTime, kind, origin, previousStartTime);
        } catch (Exception ex) {
            log.warn("Booking change side effects failed after commit for companyId={} bookingId={} kind={}", companyId, bookingId, kind, ex);
        }
    }

    private void publishAfterCommit(Long companyId, Long bookingId, LocalDateTime startTime, LocalDateTime endTime, String kind, String origin, LocalDateTime previousStartTime) {
        try {
            tenantNotificationService.createBookingNotification(bookingId, kind, origin, previousStartTime);
        } catch (Exception ex) {
            log.warn("Failed creating staff notification for bookingId={} kind={}", bookingId, kind, ex);
        }
        realtimeService.publishBookingUpdated(companyId, bookingId, startTime, endTime, kind);
        bookingReminderService.reconcileBookingAfterCommit(bookingId, kind);

        if (BOOKING_CANCELLED.equals(kind) || BOOKING_DELETED.equals(kind) || BOOKING_RESCHEDULED.equals(kind)) {
            try {
                WaitlistService waitlist = waitlistServiceProvider == null ? null : waitlistServiceProvider.getIfAvailable();
                if (waitlist != null) {
                    waitlist.handleReleasedSlot(companyId, bookingId, startTime, endTime, kind, previousStartTime);
                }
            } catch (Exception ex) {
                log.warn("Failed processing released slot for waitlist companyId={} bookingId={} kind={}", companyId, bookingId, kind, ex);
            }
        }

        try {
            if (BOOKING_DELETED.equals(kind) || BOOKING_CANCELLED.equals(kind)) {
                sessionBookings.findById(bookingId).ifPresentOrElse(
                        booking -> googleCalendarSyncQueueService.enqueueDelete(booking.getCompany(), GoogleCalendarEntityType.SESSION_BOOKING, booking.getId()),
                        () -> {
                            var company = new com.example.app.company.Company();
                            company.setId(companyId);
                            googleCalendarSyncQueueService.enqueueDelete(company, GoogleCalendarEntityType.SESSION_BOOKING, bookingId);
                        }
                );
            } else {
                sessionBookings.findById(bookingId).ifPresent(booking -> googleCalendarSyncQueueService.enqueueUpsert(
                        booking.getCompany(),
                        booking.getConsultant() == null ? null : booking.getConsultant().getId(),
                        GoogleCalendarEntityType.SESSION_BOOKING,
                        booking.getId()
                ));
            }
        } catch (Exception ignored) {
            // Realtime/push notifications should not fail because Google Calendar sync is unavailable.
        }

        // Do not send a generic visible booking-change push from this low-level publisher.
        // Tenant-facing booking notifications are sent by ReminderService using
        // Configuration -> Notifications -> Guest app templates, so this publisher only keeps
        // realtime dashboard refresh and reminder reconciliation side effects. Sending a
        // hard-coded push here would override/duplicate the tenant's configured push text.
    }
}

