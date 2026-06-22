package com.example.app.billing;

import com.example.app.monitoring.ScheduledJobTrackerService;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OpenBillSyncScheduler {
    private static final Logger log = LoggerFactory.getLogger(OpenBillSyncScheduler.class);

    private final OpenBillSyncService openBillSyncService;
    private final ScheduledJobTrackerService jobTracker;

    public OpenBillSyncScheduler(OpenBillSyncService openBillSyncService, ScheduledJobTrackerService jobTracker) {
        this.openBillSyncService = openBillSyncService;
        this.jobTracker = jobTracker;
    }

    @Scheduled(cron = "${app.open-bills.sync-cron:0/30 * * * * *}")
    @SchedulerLock(name = "openBillSyncScheduler_processDueQueue", lockAtMostFor = "PT5M", lockAtLeastFor = "PT5S")
    public void processDueOpenBillSyncQueue() {
        jobTracker.run("open-bill-sync-queue", () -> {
            int processed = openBillSyncService.processDueQueue();
            if (processed > 0) {
                log.debug("Processed {} due open-bill sync queue items", processed);
            }
            return processed;
        });
    }
}
