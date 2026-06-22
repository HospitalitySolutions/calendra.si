package com.example.app.guest.notifications;

import com.example.app.client.Client;
import com.example.app.company.Company;
import com.example.app.guest.model.BookingPushReminder;
import com.example.app.guest.model.BookingPushReminderRepository;
import com.example.app.guest.model.BookingPushReminderStatus;
import com.example.app.guest.model.GuestNotification;
import com.example.app.guest.model.GuestNotificationType;
import com.example.app.guest.model.GuestTenantLink;
import com.example.app.guest.model.GuestTenantLinkRepository;
import com.example.app.guest.model.GuestTenantLinkStatus;
import com.example.app.guest.model.GuestUser;
import com.example.app.guest.model.GuestUserRepository;
import com.example.app.monitoring.ScheduledJobTrackerService;
import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import com.example.app.session.SessionBookingStatus;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

@Service
public class GuestBookingReminderService {
    private static final Logger log = LoggerFactory.getLogger(GuestBookingReminderService.class);
    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");
    private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d. M. yyyy", Locale.forLanguageTag("sl-SI"));
    private static final List<Integer> ALLOWED_MINUTES = List.of(5, 15, 30, 60, 180, 1440);

    private final BookingPushReminderRepository reminders;
    private final SessionBookingRepository bookings;
    private final GuestTenantLinkRepository tenantLinks;
    private final GuestUserRepository guestUsers;
    private final GuestNotificationService guestNotifications;
    private final GuestPushService guestPushService;
    private final boolean enabled;
    private final ScheduledJobTrackerService jobTracker;
    private final ZoneId timezone;

    public GuestBookingReminderService(
            BookingPushReminderRepository reminders,
            SessionBookingRepository bookings,
            GuestTenantLinkRepository tenantLinks,
            GuestUserRepository guestUsers,
            GuestNotificationService guestNotifications,
            GuestPushService guestPushService,
            ScheduledJobTrackerService jobTracker,
            @Value("${app.guest.booking-reminders.enabled:true}") boolean enabled,
            @Value("${app.reminders.timezone:}") String timezoneId
    ) {
        this.reminders = reminders;
        this.bookings = bookings;
        this.tenantLinks = tenantLinks;
        this.guestUsers = guestUsers;
        this.guestNotifications = guestNotifications;
        this.guestPushService = guestPushService;
        this.jobTracker = jobTracker;
        this.enabled = enabled;
        this.timezone = timezoneId == null || timezoneId.isBlank() ? ZoneId.systemDefault() : ZoneId.of(timezoneId);
    }

    public void reconcileBookingAfterCommit(Long bookingId, String changeKind) {
        if (bookingId == null) return;
        Runnable task = () -> reconcileBooking(bookingId, changeKind);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
            return;
        }
        task.run();
    }

    public void recalculateFutureRemindersForGuestAfterCommit(Long guestUserId) {
        if (guestUserId == null) return;
        Runnable task = () -> recalculateFutureRemindersForGuest(guestUserId);
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    task.run();
                }
            });
            return;
        }
        task.run();
    }

    @Transactional
    public void reconcileBooking(Long bookingId, String changeKind) {
        if (!enabled || bookingId == null) return;
        SessionBooking booking = bookings.findById(bookingId).orElse(null);
        if (booking == null || isCancelledKind(changeKind) || !isRemindable(booking)) {
            cancelPendingByBookingId(bookingId);
            return;
        }
        scheduleForLinkedGuests(booking, now());
    }

    @Transactional
    public void recalculateFutureRemindersForGuest(Long guestUserId) {
        if (!enabled || guestUserId == null) return;
        GuestUser guestUser = guestUsers.findById(guestUserId).orElse(null);
        if (guestUser == null || !guestUser.isNotifyRemindersEnabled()) {
            cancelPendingByGuestUserId(guestUserId);
            return;
        }

        LocalDateTime now = now();
        for (GuestTenantLink link : tenantLinks.findAllByGuestUserIdAndStatus(guestUserId, GuestTenantLinkStatus.ACTIVE)) {
            if (link.getCompany() == null || link.getClient() == null) continue;
            List<SessionBooking> upcoming = bookings.findUpcomingActiveByClientIdAndCompanyId(
                    link.getClient().getId(),
                    link.getCompany().getId(),
                    now
            );
            for (SessionBooking booking : upcoming) {
                scheduleForGuest(booking, guestUser, link.getCompany(), link.getClient(), now);
            }
        }
    }

    @Scheduled(cron = "${app.guest.booking-reminders.dispatch-cron:0 * * * * *}")
    @SchedulerLock(name = "guestBookingReminderService_dispatchDue", lockAtMostFor = "PT5M", lockAtLeastFor = "PT10S")
    @Transactional
    public void dispatchDueReminders() {
        if (!enabled) {
            jobTracker.skipped("guest-booking-push-reminders", "Guest booking push reminders disabled by configuration.");
            return;
        }
        jobTracker.run("guest-booking-push-reminders", () -> {
            LocalDateTime now = now();
            List<BookingPushReminder> due = reminders.findAllByStatusAndDueAtLessThanEqualOrderByDueAtAscIdAsc(
                    BookingPushReminderStatus.PENDING,
                    now,
                    PageRequest.of(0, 100)
            );
            for (BookingPushReminder reminder : due) {
                dispatchOne(reminder, now);
            }
            return due.size();
        });
    }

    private void scheduleForLinkedGuests(SessionBooking booking, LocalDateTime now) {
        if (booking.getCompany() == null || booking.getClient() == null) return;
        tenantLinks.findAllByCompanyIdAndClientIdAndStatusOrderByUpdatedAtDesc(
                        booking.getCompany().getId(),
                        booking.getClient().getId(),
                        GuestTenantLinkStatus.ACTIVE
                )
                .forEach(link -> {
                    if (link.getGuestUser() == null) return;
                    scheduleForGuest(booking, link.getGuestUser(), link.getCompany(), link.getClient(), now);
                });
    }

    private void scheduleForGuest(SessionBooking booking, GuestUser guestUser, Company company, Client client, LocalDateTime now) {
        if (booking == null || guestUser == null || company == null || client == null) return;
        if (!guestUser.isNotifyRemindersEnabled()) {
            reminders.findByBookingIdAndGuestUserId(booking.getId(), guestUser.getId()).ifPresent(row -> {
                if (row.getStatus() == BookingPushReminderStatus.PENDING) row.setStatus(BookingPushReminderStatus.CANCELLED);
            });
            return;
        }
        if (!isRemindable(booking)) {
            cancelPendingByBookingId(booking.getId());
            return;
        }
        int minutes = normalizeReminderMinutes(guestUser.getNotifyReminderMinutes());
        BookingPushReminder row = reminders.findByBookingIdAndGuestUserId(booking.getId(), guestUser.getId())
                .orElseGet(BookingPushReminder::new);
        if (row.getId() != null
                && row.getStatus() == BookingPushReminderStatus.SENT
                && row.getReminderMinutes() == minutes
                && Objects.equals(row.getBookingStartAt(), booking.getStartTime())) {
            return;
        }
        LocalDateTime dueAt = booking.getStartTime().minusMinutes(minutes);
        if (dueAt.isBefore(now)) {
            dueAt = now;
        }
        row.setBooking(booking);
        row.setGuestUser(guestUser);
        row.setCompany(company);
        row.setClient(client);
        row.setDueAt(dueAt);
        row.setBookingStartAt(booking.getStartTime());
        row.setReminderMinutes(minutes);
        row.setStatus(BookingPushReminderStatus.PENDING);
        row.setSentAt(null);
        row.setFailedAt(null);
        row.setAttempts(0);
        row.setLastError(null);
        reminders.save(row);
    }

    private void dispatchOne(BookingPushReminder reminder, LocalDateTime now) {
        try {
            SessionBooking booking = reminder.getBooking();
            GuestUser guestUser = reminder.getGuestUser();
            if (booking == null || guestUser == null || !guestUser.isNotifyRemindersEnabled() || !isRemindable(booking)) {
                reminder.setStatus(BookingPushReminderStatus.CANCELLED);
                return;
            }
            if (booking.getStartTime() == null || !booking.getStartTime().isAfter(now)) {
                reminder.setStatus(BookingPushReminderStatus.CANCELLED);
                return;
            }
            String title = localizedTitle(guestUser);
            String body = localizedBody(guestUser, booking);
            GuestNotification notification = guestNotifications.create(
                    guestUser,
                    reminder.getCompany(),
                    reminder.getClient(),
                    GuestNotificationType.BOOKING_REMINDER,
                    title,
                    body,
                    payload(booking, reminder)
            );
            Map<String, String> extra = new LinkedHashMap<>();
            extra.put("event", "booking_reminder");
            extra.put("reminderKind", "GUEST_SELECTED_BEFORE_BOOKING");
            extra.put("bookingId", String.valueOf(booking.getId()));
            extra.put("reminderMinutes", String.valueOf(reminder.getReminderMinutes()));
            if (notification == null) {
                reminder.setStatus(BookingPushReminderStatus.CANCELLED);
                reminder.setLastError("Guest app notifications are disabled for this tenant");
                return;
            }
            if (notification.getId() != null) {
                extra.put("notificationId", String.valueOf(notification.getId()));
            }
            GuestPushService.DeliveryResult delivery = guestPushService.notifyGuestReminder(
                    guestUser,
                    reminder.getCompany(),
                    reminder.getClient(),
                    title,
                    body,
                    extra
            );
            reminder.setAttempts(reminder.getAttempts() + 1);
            if (delivery != null && delivery.delivered()) {
                reminder.setStatus(BookingPushReminderStatus.SENT);
                reminder.setSentAt(now);
                reminder.setFailedAt(null);
                reminder.setLastError(null);
                return;
            }
            reminder.setFailedAt(now);
            reminder.setLastError(deliverySummary(delivery));
            if (reminder.getAttempts() >= 3) {
                reminder.setStatus(BookingPushReminderStatus.FAILED);
            }
        } catch (Exception ex) {
            reminder.setAttempts(reminder.getAttempts() + 1);
            reminder.setFailedAt(now);
            reminder.setLastError(truncate(ex.getMessage(), 1000));
            if (reminder.getAttempts() >= 3) {
                reminder.setStatus(BookingPushReminderStatus.FAILED);
            }
            log.warn("Failed to dispatch guest booking reminder id={}: {}", reminder.getId(), ex.getMessage());
        }
    }

    private boolean isRemindable(SessionBooking booking) {
        if (booking == null || booking.getId() == null || booking.getStartTime() == null) return false;
        if (booking.getStartTime().isBefore(now())) return false;
        String status = SessionBookingStatus.normalizeStored(booking.getBookingStatus());
        return !SessionBookingStatus.CANCELLED.equals(status) && !SessionBookingStatus.NO_SHOW.equals(status);
    }

    private void cancelPendingByBookingId(Long bookingId) {
        reminders.findAllByBookingIdAndStatus(bookingId, BookingPushReminderStatus.PENDING)
                .forEach(row -> row.setStatus(BookingPushReminderStatus.CANCELLED));
    }

    private void cancelPendingByGuestUserId(Long guestUserId) {
        reminders.findAllByGuestUserIdAndStatus(guestUserId, BookingPushReminderStatus.PENDING)
                .forEach(row -> row.setStatus(BookingPushReminderStatus.CANCELLED));
    }

    private LocalDateTime now() {
        return LocalDateTime.now(timezone);
    }

    private static boolean isCancelledKind(String changeKind) {
        return changeKind != null && ("BOOKING_CANCELLED".equalsIgnoreCase(changeKind) || "BOOKING_DELETED".equalsIgnoreCase(changeKind));
    }

    private static int normalizeReminderMinutes(int value) {
        return ALLOWED_MINUTES.contains(value) ? value : 60;
    }

    private static String localizedTitle(GuestUser guestUser) {
        return isSl(guestUser) ? "Opomnik za termin" : "Booking reminder";
    }

    private static String localizedBody(GuestUser guestUser, SessionBooking booking) {
        String service = booking.getType() != null && booking.getType().getName() != null && !booking.getType().getName().isBlank()
                ? booking.getType().getName().trim()
                : (isSl(guestUser) ? "Termin" : "Your booking");
        String date = booking.getStartTime().format(DATE);
        String time = booking.getStartTime().format(TIME);
        if (isSl(guestUser)) {
            return service + " se začne " + date + " ob " + time + ".";
        }
        return service + " starts on " + date + " at " + time + ".";
    }

    private static boolean isSl(GuestUser guestUser) {
        return guestUser != null && guestUser.getLanguage() != null && guestUser.getLanguage().toLowerCase(Locale.ROOT).startsWith("sl");
    }

    private static String payload(SessionBooking booking, BookingPushReminder reminder) {
        return "{\"event\":\"booking_reminder\",\"bookingId\":\"" + booking.getId()
                + "\",\"reminderMinutes\":" + reminder.getReminderMinutes() + "}";
    }

    private static String deliverySummary(GuestPushService.DeliveryResult result) {
        if (result == null) {
            return "Push delivery returned no result.";
        }
        if (result.attemptedCount() <= 0) {
            return "Push delivery skipped or no guest device tokens were available.";
        }
        return "Push delivery failed: attempted=" + result.attemptedCount()
                + ", delivered=" + result.deliveredCount()
                + ", invalidTokens=" + result.invalidTokenCount()
                + ", failed=" + result.failedCount();
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }
}
