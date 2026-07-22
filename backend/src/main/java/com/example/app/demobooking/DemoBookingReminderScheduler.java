package com.example.app.demobooking;

import java.time.Duration;
import java.time.Instant;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class DemoBookingReminderScheduler {
    private final DemoBookingRepository bookings;
    private final DemoBookingEmailService emails;

    public DemoBookingReminderScheduler(DemoBookingRepository bookings, DemoBookingEmailService emails) {
        this.bookings = bookings;
        this.emails = emails;
    }

    @Scheduled(cron = "0 */15 * * * *")
    @Transactional
    public void sendDueReminders() {
        Instant now = Instant.now();
        Instant latest = now.plus(Duration.ofHours(25));
        for (DemoBooking booking : bookings.findConfirmedReminderRange(now, latest)) {
            Duration until = Duration.between(now, booking.getStartAt());
            long minutes = until.toMinutes();
            if (minutes >= 45 && minutes <= 75 && booking.getReminder1hSentAt() == null) {
                emails.sendReminder(booking, booking.getLocale(), 1);
                booking.setReminder1hSentAt(now);
                bookings.save(booking);
            } else if (minutes >= 23 * 60 + 45 && minutes <= 24 * 60 + 15 && booking.getReminder24hSentAt() == null) {
                emails.sendReminder(booking, booking.getLocale(), 24);
                booking.setReminder24hSentAt(now);
                bookings.save(booking);
            }
        }
    }
}
