package com.example.app.inbox;

import com.example.app.monitoring.ScheduledJobTrackerService;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import java.time.Duration;
import java.time.Instant;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class InboxMessageRetentionScheduler {
    private final ClientMessageService service;
    private final ScheduledJobTrackerService jobTracker;
    private final Duration retention;

    public InboxMessageRetentionScheduler(
            ClientMessageService service,
            ScheduledJobTrackerService jobTracker,
            @Value("${app.inbox.message-retention:P90D}") Duration retention
    ) {
        this.service = service;
        this.jobTracker = jobTracker;
        this.retention = retention == null || retention.isNegative() || retention.isZero() ? Duration.ofDays(90) : retention;
    }

    @Scheduled(cron = "${app.inbox.message-retention-cron:0 47 2 * * *}")
    @SchedulerLock(name = "inboxMessageRetentionScheduler_purgeExpiredMessages", lockAtMostFor = "PT30M", lockAtLeastFor = "PT1M")
    public void purgeExpiredMessages() {
        jobTracker.run("inbox-message-cleanup", () -> service.purgeMessagesOlderThan(Instant.now().minus(retention)));
    }
}
