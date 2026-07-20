package com.example.app.inbox;

import com.example.app.monitoring.ScheduledJobTrackerService;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScheduledMessageDispatchScheduler {
    private final ClientMessageService service;
    private final ScheduledJobTrackerService jobTracker;

    public ScheduledMessageDispatchScheduler(ClientMessageService service, ScheduledJobTrackerService jobTracker) {
        this.service = service;
        this.jobTracker = jobTracker;
    }

    @Scheduled(cron = "0 * * * * *")
    @SchedulerLock(name = "scheduledMessageDispatchScheduler_dispatchDue", lockAtMostFor = "${app.inbox.scheduled-dispatch-lock-at-most:PT30M}", lockAtLeastFor = "PT1S")
    public void dispatchDue() {
        jobTracker.run("scheduled-messages-dispatch", () -> { return service.dispatchDueScheduledMessages(); });
    }
}
