package com.example.app.monitoring;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduledJobMonitoringService {
    private final ScheduledJobRunRepository runs;
    private final ScheduledJobAlertService alerts;

    public ScheduledJobMonitoringService(ScheduledJobRunRepository runs, ScheduledJobAlertService alerts) {
        this.runs = runs;
        this.alerts = alerts;
    }

    @Transactional(readOnly = true)
    public List<ScheduledJobStatusDto> statuses() {
        Map<String, ScheduledJobAlertDefinition> definitions = new LinkedHashMap<>();
        for (ScheduledJobAlertDefinition definition : ScheduledJobAlertDefinitions.all()) {
            definitions.put(definition.jobName(), definition);
        }
        Map<String, List<ScheduledJobRun>> grouped = new LinkedHashMap<>();
        for (String jobName : definitions.keySet()) grouped.put(jobName, new ArrayList<>());
        for (ScheduledJobRun run : runs.findByJobNameInOrderByStartedAtDesc(definitions.keySet())) {
            grouped.computeIfAbsent(run.getJobName(), ignored -> new ArrayList<>()).add(run);
        }
        Map<String, List<ScheduledJobAlertService.ScheduledJobAlertDto>> activeAlerts = alerts.activeAlertDtosByJob(List.copyOf(definitions.keySet()));
        Instant now = Instant.now();
        return definitions.values().stream()
                .map(def -> toStatus(def, grouped.getOrDefault(def.jobName(), List.of()), activeAlerts.getOrDefault(def.jobName(), List.of()), now))
                .toList();
    }

    @Transactional(readOnly = true)
    public List<ScheduledJobRunDto> recentRuns(String jobName) {
        String normalized = jobName == null ? "" : jobName.trim();
        if (normalized.isBlank()) return List.of();
        return runs.findByJobNameOrderByStartedAtDesc(normalized, PageRequest.of(0, 100)).stream()
                .map(this::toRunDto)
                .toList();
    }

    private ScheduledJobStatusDto toStatus(
            ScheduledJobAlertDefinition definition,
            List<ScheduledJobRun> allRuns,
            List<ScheduledJobAlertService.ScheduledJobAlertDto> activeAlerts,
            Instant now
    ) {
        List<ScheduledJobRun> runsForJob = allRuns.stream()
                .sorted((a, b) -> {
                    Instant as = a.getStartedAt();
                    Instant bs = b.getStartedAt();
                    if (as == null && bs == null) return 0;
                    if (as == null) return 1;
                    if (bs == null) return -1;
                    return bs.compareTo(as);
                })
                .toList();
        ScheduledJobRun latest = runsForJob.isEmpty() ? null : runsForJob.get(0);
        ScheduledJobRun lastSuccess = runsForJob.stream()
                .filter(run -> ScheduledJobTrackerService.STATUS_SUCCESS.equalsIgnoreCase(run.getStatus()))
                .findFirst()
                .orElse(null);
        long failedLast24h = runsForJob.stream()
                .filter(run -> run.getStartedAt() != null && run.getStartedAt().isAfter(now.minus(Duration.ofHours(24))))
                .filter(run -> ScheduledJobTrackerService.STATUS_FAILED.equalsIgnoreCase(run.getStatus()))
                .count();

        String health = "OK";
        String summary;
        String detail;
        if (latest == null) {
            health = "WARN";
            summary = "No run observed yet";
            detail = "No tracked execution has been recorded for this job since scheduled-job tracking was deployed.";
        } else if (ScheduledJobTrackerService.STATUS_RUNNING.equalsIgnoreCase(latest.getStatus())
                && latest.getStartedAt() != null
                && latest.getStartedAt().isBefore(now.minus(definition.stuckAfter()))) {
            health = "CRITICAL";
            summary = "Possibly stuck";
            detail = "Latest run has been RUNNING longer than " + formatDuration(definition.stuckAfter()) + ".";
        } else if (ScheduledJobTrackerService.STATUS_FAILED.equalsIgnoreCase(latest.getStatus())) {
            health = "CRITICAL";
            summary = "Latest run failed";
            detail = latest.getErrorMessage() == null || latest.getErrorMessage().isBlank()
                    ? "Latest run failed without a stored error message."
                    : latest.getErrorMessage();
        } else if (lastSuccess == null || lastSuccess.getFinishedAt() == null
                || lastSuccess.getFinishedAt().isBefore(now.minus(definition.expectedSuccessWithin()))) {
            health = "WARN";
            summary = "Missing recent success";
            detail = "No successful run within expected window: " + formatDuration(definition.expectedSuccessWithin()) + ".";
        } else if (failedLast24h > 0) {
            health = "WARN";
            summary = failedLast24h + " failure" + (failedLast24h == 1 ? "" : "s") + " in 24h";
            detail = "Latest successful run is recent, but failures were recorded in the last 24 hours.";
        } else {
            summary = "OK";
            detail = "Last successful run is within expected window.";
        }

        ScheduledJobAlertService.ScheduledJobAlertDto primaryAlert = activeAlerts == null || activeAlerts.isEmpty() ? null : activeAlerts.get(0);

        return new ScheduledJobStatusDto(
                definition.jobName(),
                definition.label(),
                definition.description(),
                health,
                summary,
                detail,
                latest == null ? null : toRunDto(latest),
                lastSuccess == null ? null : toRunDto(lastSuccess),
                failedLast24h,
                formatDuration(definition.expectedSuccessWithin()),
                formatDuration(definition.stuckAfter()),
                primaryAlert == null ? null : primaryAlert.alertType(),
                primaryAlert == null ? null : primaryAlert.severity(),
                primaryAlert == null ? null : primaryAlert.message(),
                primaryAlert == null ? null : primaryAlert.firstDetectedAt(),
                activeAlerts == null ? 0 : activeAlerts.size()
        );
    }

    private ScheduledJobRunDto toRunDto(ScheduledJobRun run) {
        return new ScheduledJobRunDto(
                run.getId(),
                run.getJobName(),
                run.getStatus(),
                iso(run.getStartedAt()),
                iso(run.getFinishedAt()),
                run.getDurationMs(),
                run.getInstanceId(),
                run.getRecordsProcessed(),
                run.getErrorMessage()
        );
    }


    private static String iso(Instant instant) {
        return instant == null ? null : instant.toString();
    }

    private static String formatDuration(Duration duration) {
        if (duration == null) return "—";
        long seconds = Math.max(0L, duration.toSeconds());
        long days = seconds / 86_400L;
        long hours = (seconds % 86_400L) / 3_600L;
        long minutes = (seconds % 3_600L) / 60L;
        if (days > 0) return String.format(Locale.ROOT, "%dd %dh", days, hours);
        if (hours > 0) return String.format(Locale.ROOT, "%dh %dm", hours, minutes);
        return String.format(Locale.ROOT, "%dm", minutes);
    }


    public record ScheduledJobStatusDto(
            String jobName,
            String label,
            String description,
            String health,
            String summary,
            String detail,
            ScheduledJobRunDto latestRun,
            ScheduledJobRunDto lastSuccess,
            long failuresLast24h,
            String expectedSuccessWithin,
            String stuckAfter,
            String activeAlertType,
            String activeAlertSeverity,
            String activeAlertMessage,
            String activeAlertSince,
            int activeAlertCount
    ) {}

    public record ScheduledJobRunDto(
            Long id,
            String jobName,
            String status,
            String startedAt,
            String finishedAt,
            Long durationMs,
            String instanceId,
            Integer recordsProcessed,
            String errorMessage
    ) {}
}
