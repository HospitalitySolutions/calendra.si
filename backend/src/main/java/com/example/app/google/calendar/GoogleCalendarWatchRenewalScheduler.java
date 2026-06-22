package com.example.app.google.calendar;

import com.example.app.monitoring.ScheduledJobTrackerService;
import java.time.Instant;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class GoogleCalendarWatchRenewalScheduler {
    private final GoogleCalendarConnectionRepository connections;
    private final GoogleCalendarConnectionService connectionService;
    private final ScheduledJobTrackerService jobTracker;

    public GoogleCalendarWatchRenewalScheduler(GoogleCalendarConnectionRepository connections, GoogleCalendarConnectionService connectionService, ScheduledJobTrackerService jobTracker) {
        this.connections = connections;
        this.connectionService = connectionService;
        this.jobTracker = jobTracker;
    }

    @Scheduled(cron = "${app.google-calendar.watch-renewal-cron:0 23 * * * *}")
    @SchedulerLock(name = "googleCalendarWatchRenewal", lockAtMostFor = "PT10M", lockAtLeastFor = "PT30S")
    public void renewExpiringWatches() {
        jobTracker.run("google-calendar-watch-renewal", () -> {
            Instant before = Instant.now().plusSeconds(60L * 60L * 24L);
            var expiring = connections.findActiveChannelsExpiringBefore(before);
            for (GoogleCalendarConnection connection : expiring) connectionService.tryStartWatch(connection);
            return expiring.size();
        });
    }
}
