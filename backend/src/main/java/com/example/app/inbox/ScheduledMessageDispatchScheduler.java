package com.example.app.inbox;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScheduledMessageDispatchScheduler {
    private final ClientMessageService service;

    public ScheduledMessageDispatchScheduler(ClientMessageService service) {
        this.service = service;
    }

    @Scheduled(cron = "0 * * * * *")
    @SchedulerLock(name = "scheduledMessageDispatchScheduler_dispatchDue", lockAtMostFor = "PT5M", lockAtLeastFor = "PT1S")
    public void dispatchDue() {
        service.dispatchDueScheduledMessages();
    }
}
