package com.example.app.reminder;

import com.example.app.session.SessionBooking;
import com.example.app.session.SessionBookingRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

/**
 * Sends reminders (email + SMS) 1 hour before booked sessions.
 * Runs every 10 minutes and processes sessions starting in 55–65 minutes.
 */
@Component
public class ReminderScheduler {
    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    private final SessionBookingRepository sessionBookings;
    private final ReminderService reminderService;
    private final boolean enabled;
    private final ZoneId timezone;

    public ReminderScheduler(
            SessionBookingRepository sessionBookings,
            ReminderService reminderService,
            @Value("${app.reminders.enabled:true}") boolean enabled,
            @Value("${app.reminders.timezone:}") String timezoneId
    ) {
        this.sessionBookings = sessionBookings;
        this.reminderService = reminderService;
        this.enabled = enabled;
        this.timezone = (timezoneId != null && !timezoneId.isBlank())
                ? ZoneId.of(timezoneId)
                : ZoneId.systemDefault();
        log.info("Reminder scheduler started (enabled={}, timezone={}, SMS={}, Email={}, runs every 1hr, window 50-70min before session)",
                enabled, this.timezone, reminderService.isSmsConfigured(), reminderService.isMailConfigured());
    }

    @Scheduled(cron = "0 0 0 1 1 *") // every 5 minutes at :00, :05, :10, ...
    @Transactional
    public void sendReminders() {
        if (!enabled) return;

        LocalDateTime now = LocalDateTime.now(timezone);
        LocalDateTime from = now.plusMinutes(50);
        LocalDateTime to = now.plusMinutes(70);

        log.debug("Reminder check: now={}, window {} to {} (sessions starting in ~1h)", now, from, to);
        List<SessionBooking> sessions = sessionBookings.findSessionsNeedingReminders(from, to);
        log.info("Reminder check: found {} session(s) needing reminders (SMS: {}, Email: {})",
                sessions.size(), reminderService.isSmsConfigured(), reminderService.isMailConfigured());

        for (SessionBooking booking : sessions) {
            if (booking.getClient() == null || booking.getClient().isAnonymized()) {
                log.info("Skipping reminder for session {} because client is anonymized", booking.getId());
                booking.setReminderSentAt(now);
                sessionBookings.save(booking);
                continue;
            }
            String phone = booking.getClient().getPhone();
            String email = booking.getClient().getEmail();
            log.info("Sending reminder for session {} at {} (phone: {}, email: {})",
                    booking.getId(), booking.getStartTime(),
                    phone != null && !phone.isBlank() ? "yes" : "no", email != null && !email.isBlank() ? "yes" : "no");
            try {
                reminderService.sendReminders(booking);
                booking.setReminderSentAt(now);
                sessionBookings.save(booking);
            } catch (Exception e) {
                log.error("Failed to send reminder for session {}: {}", booking.getId(), e.getMessage());
            }
        }
    }
}
