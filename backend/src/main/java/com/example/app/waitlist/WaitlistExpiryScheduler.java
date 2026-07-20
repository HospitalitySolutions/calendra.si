package com.example.app.waitlist;

import com.example.app.monitoring.ScheduledJobTrackerService;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Runs one bounded waitlist-expiry batch across the whole cluster. */
@Component
public class WaitlistExpiryScheduler {
    private final WaitlistService waitlistService;
    private final ScheduledJobTrackerService jobTracker;

    public WaitlistExpiryScheduler(WaitlistService waitlistService, ScheduledJobTrackerService jobTracker) {
        this.waitlistService = waitlistService;
        this.jobTracker = jobTracker;
    }

    @Scheduled(fixedDelayString = "${app.waitlist.expiry-check-ms:60000}")
    @SchedulerLock(
            name = "waitlistExpiryScheduler_expireOffers",
            lockAtMostFor = "${app.waitlist.expiry-lock-at-most:PT10M}",
            lockAtLeastFor = "PT1S"
    )
    public void expireOffers() {
        jobTracker.run("waitlist-offer-expiry", () -> { return waitlistService.expireOffersBatch(); });
    }
}
