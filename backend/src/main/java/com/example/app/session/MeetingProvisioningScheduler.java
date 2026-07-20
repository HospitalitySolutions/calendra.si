package com.example.app.session;

import com.example.app.monitoring.ScheduledJobTrackerService;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class MeetingProvisioningScheduler {
    private final MeetingProvisioningService provisioningService;
    private final ScheduledJobTrackerService jobTracker;

    public MeetingProvisioningScheduler(
            MeetingProvisioningService provisioningService,
            ScheduledJobTrackerService jobTracker
    ) {
        this.provisioningService = provisioningService;
        this.jobTracker = jobTracker;
    }

    @Scheduled(fixedDelayString = "${app.meetings.provisioning.poll-ms:10000}")
    @SchedulerLock(
            name = "meetingProvisioningScheduler_processDue",
            lockAtMostFor = "${app.meetings.provisioning.lock-at-most:PT10M}",
            lockAtLeastFor = "PT1S"
    )
    public void processDue() {
        jobTracker.run("meeting-provisioning", () -> { return provisioningService.processDueBatch(); });
    }
}
