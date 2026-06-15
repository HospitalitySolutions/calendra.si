package com.example.app.billing;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class OpenBillSyncScheduler {
    private static final Logger log = LoggerFactory.getLogger(OpenBillSyncScheduler.class);

    private final OpenBillSyncService openBillSyncService;

    public OpenBillSyncScheduler(OpenBillSyncService openBillSyncService) {
        this.openBillSyncService = openBillSyncService;
    }

    @Scheduled(cron = "${app.open-bills.sync-cron:0/30 * * * * *}")
    @SchedulerLock(name = "openBillSyncScheduler_processDueQueue", lockAtMostFor = "PT5M", lockAtLeastFor = "PT5S")
    public void processDueOpenBillSyncQueue() {
        try {
            int processed = openBillSyncService.processDueQueue();
            if (processed > 0) {
                log.debug("Processed {} due open-bill sync queue items", processed);
            }
        } catch (Exception ex) {
            log.warn("Open bill dirty-queue processing failed", ex);
        }
    }
}
