package com.example.app.google.calendar;

import java.time.Instant;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class GoogleCalendarWatchRenewalScheduler {
    private final GoogleCalendarConnectionRepository connections;
    private final GoogleCalendarConnectionService connectionService;

    public GoogleCalendarWatchRenewalScheduler(GoogleCalendarConnectionRepository connections, GoogleCalendarConnectionService connectionService) {
        this.connections = connections;
        this.connectionService = connectionService;
    }

    @Scheduled(cron = "${app.google-calendar.watch-renewal-cron:0 23 * * * *}")
    @SchedulerLock(name = "googleCalendarWatchRenewal", lockAtMostFor = "PT10M", lockAtLeastFor = "PT30S")
    public void renewExpiringWatches() {
        Instant before = Instant.now().plusSeconds(60L * 60L * 24L);
        for (GoogleCalendarConnection connection : connections.findActiveChannelsExpiringBefore(before)) connectionService.tryStartWatch(connection);
    }
}
