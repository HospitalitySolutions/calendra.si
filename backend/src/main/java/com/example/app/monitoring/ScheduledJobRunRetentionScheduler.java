package com.example.app.monitoring;

import java.time.Duration;
import java.time.Instant;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

@Component
public class ScheduledJobRunRetentionScheduler {
    private static final Logger log = LoggerFactory.getLogger(ScheduledJobRunRetentionScheduler.class);

    private final ScheduledJobRunRepository runs;
    private final ScheduledJobTrackerService jobTracker;
    private final Duration retention;

    public ScheduledJobRunRetentionScheduler(
            ScheduledJobRunRepository runs,
            ScheduledJobTrackerService jobTracker,
            @Value("${app.scheduled-job-runs.retention:P30D}") Duration retention
    ) {
        this.runs = runs;
        this.jobTracker = jobTracker;
        this.retention = retention == null || retention.isNegative() || retention.isZero()
                ? Duration.ofDays(30)
                : retention;
    }

    @Scheduled(cron = "${app.scheduled-job-runs.retention-cron:0 7 3 * * *}")
    @SchedulerLock(name = "scheduledJobRunRetentionScheduler_purgeExpiredRuns", lockAtMostFor = "PT20M", lockAtLeastFor = "PT1M")
    @Transactional
    public void purgeExpiredRuns() {
        jobTracker.run("scheduled-job-run-cleanup", () -> {
            long deleted = runs.deleteByCreatedAtBefore(Instant.now().minus(retention));
            if (deleted > 0) {
                log.info("Deleted {} scheduled job run rows older than {}.", deleted, retention);
            }
            return deleted > Integer.MAX_VALUE ? Integer.MAX_VALUE : (int) deleted;
        });
    }
}
