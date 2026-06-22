package com.example.app.google.calendar;

import com.example.app.monitoring.ScheduledJobTrackerService;
import java.time.Duration;
import java.time.Instant;
import net.javacrumbs.shedlock.spring.annotation.SchedulerLock;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.data.domain.PageRequest;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class GoogleCalendarJobRunner {
    private static final Logger log = LoggerFactory.getLogger(GoogleCalendarJobRunner.class);
    private final GoogleCalendarSyncJobRepository jobs;
    private final GoogleCalendarSyncService syncService;
    private final GoogleCalendarConnectionRepository connections;
    private final ScheduledJobTrackerService jobTracker;

    public GoogleCalendarJobRunner(GoogleCalendarSyncJobRepository jobs, GoogleCalendarSyncService syncService, GoogleCalendarConnectionRepository connections, ScheduledJobTrackerService jobTracker) {
        this.jobs = jobs;
        this.syncService = syncService;
        this.connections = connections;
        this.jobTracker = jobTracker;
    }

    @Scheduled(fixedDelayString = "${app.google-calendar.job-runner-delay-ms:30000}")
    @SchedulerLock(name = "googleCalendarSyncJobRunner", lockAtMostFor = "PT5M", lockAtLeastFor = "PT5S")
    public void runDueJobs() {
        jobTracker.run("google-calendar-sync-jobs", () -> {
            var due = jobs.findDueJobs(Instant.now(), PageRequest.of(0, 25));
            for (GoogleCalendarSyncJob job : due) processOne(job.getId());
            return due.size();
        });
    }

    public void processOne(Long jobId) {
        GoogleCalendarSyncJob job = jobs.findByIdWithDetails(jobId).orElse(null);
        if (job == null || job.getStatus() != GoogleCalendarSyncJobStatus.PENDING) return;
        job.setStatus(GoogleCalendarSyncJobStatus.RUNNING);
        job.setAttempts(job.getAttempts() + 1);
        jobs.saveAndFlush(job);
        try {
            switch (job.getAction()) {
                case UPSERT_TO_GOOGLE -> syncService.upsertToGoogle(job);
                case DELETE_FROM_GOOGLE -> syncService.deleteFromGoogle(job);
                case PULL_FROM_GOOGLE -> syncService.pullFromGoogle(job, false);
                case FULL_SYNC -> syncService.fullSync(job);
            }
            job.setStatus(GoogleCalendarSyncJobStatus.DONE);
            job.setLastError(null);
            jobs.save(job);
        } catch (Exception e) {
            String message = e.getMessage() != null ? e.getMessage() : e.getClass().getSimpleName();
            log.warn("Google Calendar sync job {} failed: {}", jobId, message);
            String cleanMessage = message.length() > 1900 ? message.substring(0, 1900) : message;
            job.setLastError(cleanMessage);
            GoogleCalendarConnection connection = job.getConnection();
            if (connection != null) {
                connection.setLastError(cleanMessage);
                String lowerMessage = cleanMessage.toLowerCase();
                if (lowerMessage.contains("reconnect") || lowerMessage.contains("refresh token")) {
                    connection.setStatus(GoogleCalendarConnectionStatus.NEEDS_RECONNECT);
                } else if (job.getAttempts() >= 5) {
                    connection.setStatus(GoogleCalendarConnectionStatus.ERROR);
                }
                connections.save(connection);
            }
            if (job.getAttempts() >= 5) {
                job.setStatus(GoogleCalendarSyncJobStatus.FAILED);
            } else {
                job.setStatus(GoogleCalendarSyncJobStatus.PENDING);
                long delaySeconds = Math.min(3600, (long) Math.pow(2, job.getAttempts()) * 30L);
                job.setNextAttemptAt(Instant.now().plus(Duration.ofSeconds(delaySeconds)));
            }
            jobs.save(job);
        }
    }
}
