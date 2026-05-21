package com.example.app.session;

import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.notifications.GuestPushService;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

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

    public BookingChangePublisher(
            SessionBookingRealtimeService realtimeService,
            GuestTenantLinkRepository guestTenantLinks,
            GuestPushService guestPushService
    ) {
        this.realtimeService = realtimeService;
        this.guestTenantLinks = guestTenantLinks;
        this.guestPushService = guestPushService;
    }

    public void publish(Long companyId, Long bookingId, LocalDateTime startTime, LocalDateTime endTime, String kind) {
        if (companyId == null || bookingId == null || kind == null || kind.isBlank()) {
            return;
        }

        realtimeService.publishBookingUpdated(companyId, bookingId, startTime, endTime, kind);

        Map<String, String> data = new LinkedHashMap<>();
        data.put("type", "booking_changed");
        data.put("screen", "home");
        data.put("channel", "GUEST_APP");
        data.put("kind", kind);
        data.put("companyId", String.valueOf(companyId));
        data.put("bookingId", String.valueOf(bookingId));
        if (startTime != null) data.put("startTime", startTime.toString());
        if (endTime != null) data.put("endTime", endTime.toString());

        guestTenantLinks.findAllByCompanyIdAndStatus(companyId, GuestTenantLinkStatus.ACTIVE).forEach(link -> {
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

