package com.example.app.reminder;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneId;

/**
 * Sends tenant-configured notification templates on schedule.
 */
@Component
public class ReminderScheduler {
    private static final Logger log = LoggerFactory.getLogger(ReminderScheduler.class);

    private final ReminderService reminderService;
    private final boolean enabled;
    private final ZoneId timezone;

    public ReminderScheduler(
            ReminderService reminderService,
            @Value("${app.reminders.enabled:true}") boolean enabled,
            @Value("${app.reminders.timezone:}") String timezoneId
    ) {
        this.reminderService = reminderService;
        this.enabled = enabled;
        this.timezone = (timezoneId != null && !timezoneId.isBlank())
                ? ZoneId.of(timezoneId)
                : ZoneId.systemDefault();
        log.info("Reminder scheduler started (enabled={}, timezone={}, SMS={}, Email={})",
                enabled, this.timezone, reminderService.isSmsConfigured(), reminderService.isMailConfigured());
    }

    /**
     * Sends company-configured "before session" / "after session" template messages (email/SMS).
     */
    @Scheduled(cron = "0 */1 * * * *")
    @SchedulerLock(name = "reminderScheduler_sendScheduledTemplateNotifications", lockAtMostFor = "PT5M", lockAtLeastFor = "PT15S")
    @Transactional
    public void sendScheduledTemplateNotifications() {
        if (!enabled) {
            return;
        }
        LocalDateTime now = LocalDateTime.now(timezone);
        try {
            reminderService.sendScheduledSessionTemplateNotifications(now);
        } catch (Exception e) {
            log.error("Scheduled template notifications failed: {}", e.getMessage());
        }
    }
}
