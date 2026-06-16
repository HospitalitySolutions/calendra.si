package com.example.app.session;

import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.google.calendar.GoogleCalendarEntityType;
import com.example.app.google.calendar.GoogleCalendarSyncQueueService;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.notifications.GuestPushService;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class BookingChangePublisher {
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

    public BookingChangePublisher(
            SessionBookingRealtimeService realtimeService,
            GuestTenantLinkRepository guestTenantLinks,
            GuestPushService guestPushService,
            SessionBookingRepository sessionBookings,
            GoogleCalendarSyncQueueService googleCalendarSyncQueueService
    ) {
        this.realtimeService = realtimeService;
        this.guestTenantLinks = guestTenantLinks;
        this.guestPushService = guestPushService;
        this.sessionBookings = sessionBookings;
        this.googleCalendarSyncQueueService = googleCalendarSyncQueueService;
    }

    public void publish(Long companyId, Long bookingId, LocalDateTime startTime, LocalDateTime endTime, String kind) {
        if (companyId == null || bookingId == null || kind == null || kind.isBlank()) {
            return;
        }
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    publishAfterCommit(companyId, bookingId, startTime, endTime, kind);
                }
            });
            return;
        }
        publishAfterCommit(companyId, bookingId, startTime, endTime, kind);
    }

    private void publishAfterCommit(Long companyId, Long bookingId, LocalDateTime startTime, LocalDateTime endTime, String kind) {
        realtimeService.publishBookingUpdated(companyId, bookingId, startTime, endTime, kind);

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

        Map<String, String> data = new LinkedHashMap<>();
        data.put("type", "booking_changed");
        data.put("screen", "home");
        data.put("channel", "GUEST_APP");
        data.put("kind", kind);
        data.put("companyId", String.valueOf(companyId));
        data.put("bookingId", String.valueOf(bookingId));
        if (startTime != null) data.put("startTime", startTime.toString());
        if (endTime != null) data.put("endTime", endTime.toString());

        // Push notifications must be scoped to the guest linked to the changed booking's client.
        // The realtime event above remains tenant-wide so open apps refresh their cached dashboards,
        // but the phone notification tray must not fan out to unrelated guests of the same tenant.
        sessionBookings.findByIdAndCompanyId(bookingId, companyId)
                .filter(booking -> booking.getClient() != null && booking.getClient().getId() != null)
                .flatMap(booking -> guestTenantLinks.findByCompanyIdAndClientIdAndStatus(
                        companyId,
                        booking.getClient().getId(),
                        GuestTenantLinkStatus.ACTIVE
                ))
                .ifPresent(link -> {
                    var guestUser = link.getGuestUser();
                    if (guestUser == null) return;
                    guestPushService.notifyGuestReminder(
                            guestUser,
                            link.getCompany(),
                            link.getClient(),
                            "Booking update",
                            "A booking has changed. Open the app to see the latest time.",
                            data
                    );
                });
    }
}

