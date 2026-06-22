package com.example.app.monitoring;

import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class ScheduledJobAlertScanner {
    private final ScheduledJobTrackerService jobTracker;
    private final ScheduledJobAlertService alertService;

    public ScheduledJobAlertScanner(ScheduledJobTrackerService jobTracker, ScheduledJobAlertService alertService) {
        this.jobTracker = jobTracker;
        this.alertService = alertService;
    }

    @Scheduled(cron = "${app.scheduled-job-alerts.scan-cron:0 */5 * * * *}")
    @SchedulerLock(name = "scheduledJobAlertScanner_scan", lockAtMostFor = "PT5M", lockAtLeastFor = "PT10S")
    public void scan() {
        jobTracker.run("scheduled-job-alert-scanner", alertService::scanAndUpdateAlerts);
    }
}
