package com.example.app.monitoring;

import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class ScheduledJobAlertService {
    private final ScheduledJobRunRepository runs;
    private final ScheduledJobAlertStateRepository alerts;
    private final ScheduledJobAlertEmailService emailService;
    private final Duration startupGrace;
    private final Instant appStartedAt = Instant.now();

    public ScheduledJobAlertService(
            ScheduledJobRunRepository runs,
            ScheduledJobAlertStateRepository alerts,
            ScheduledJobAlertEmailService emailService,
            @Value("${app.scheduled-job-alerts.startup-grace:PT15M}") Duration startupGrace
    ) {
        this.runs = runs;
        this.alerts = alerts;
        this.emailService = emailService;
        this.startupGrace = startupGrace == null || startupGrace.isNegative() ? Duration.ofMinutes(15) : startupGrace;
    }

    @Transactional
    public int scanAndUpdateAlerts() {
        Instant now = Instant.now();
        Map<String, ScheduledJobAlertDefinition> definitions = new LinkedHashMap<>();
        for (ScheduledJobAlertDefinition definition : ScheduledJobAlertDefinitions.all()) {
            definitions.put(definition.jobName(), definition);
        }

        Map<String, List<ScheduledJobRun>> groupedRuns = new LinkedHashMap<>();
        for (String jobName : definitions.keySet()) groupedRuns.put(jobName, new ArrayList<>());
        for (ScheduledJobRun run : runs.findByJobNameInOrderByStartedAtDesc(definitions.keySet())) {
            groupedRuns.computeIfAbsent(run.getJobName(), ignored -> new ArrayList<>()).add(run);
        }

        int changed = 0;
        for (ScheduledJobAlertDefinition definition : definitions.values()) {
            List<ScheduledJobRun> runsForJob = groupedRuns.getOrDefault(definition.jobName(), List.of()).stream()
                    .sorted((a, b) -> {
                        Instant as = a.getStartedAt();
                        Instant bs = b.getStartedAt();
                        if (as == null && bs == null) return 0;
                        if (as == null) return 1;
                        if (bs == null) return -1;
                        return bs.compareTo(as);
                    })
                    .toList();
            changed += evaluate(definition, runsForJob, now);
        }
        return changed;
    }

    @Transactional(readOnly = true)
    public List<ScheduledJobAlertDto> activeAlertDtos() {
        return alerts.findByStatusOrderBySeverityDescLastDetectedAtDesc(ScheduledJobAlertStatus.ACTIVE).stream()
                .map(this::toDto)
                .toList();
    }

    @Transactional(readOnly = true)
    public Map<String, List<ScheduledJobAlertDto>> activeAlertDtosByJob(List<String> jobNames) {
        if (jobNames == null || jobNames.isEmpty()) return Map.of();
        Map<String, List<ScheduledJobAlertDto>> result = new LinkedHashMap<>();
        alerts.findByJobNameInAndStatusOrderByLastDetectedAtDesc(jobNames, ScheduledJobAlertStatus.ACTIVE).forEach(alert ->
                result.computeIfAbsent(alert.getJobName(), ignored -> new ArrayList<>()).add(toDto(alert))
        );
        return result;
    }

    private int evaluate(ScheduledJobAlertDefinition definition, List<ScheduledJobRun> runsForJob, Instant now) {
        ScheduledJobRun latest = runsForJob.isEmpty() ? null : runsForJob.get(0);
        ScheduledJobRun lastSuccess = runsForJob.stream()
                .filter(run -> ScheduledJobTrackerService.STATUS_SUCCESS.equalsIgnoreCase(run.getStatus()))
                .findFirst()
                .orElse(null);

        int changed = 0;
        changed += applyCondition(
                definition,
                ScheduledJobAlertType.FAILED,
                latest != null && ScheduledJobTrackerService.STATUS_FAILED.equalsIgnoreCase(latest.getStatus()),
                latest,
                latest == null ? null : failureMessage(definition, latest),
                now
        );
        changed += applyCondition(
                definition,
                ScheduledJobAlertType.STUCK_RUNNING,
                latest != null
                        && ScheduledJobTrackerService.STATUS_RUNNING.equalsIgnoreCase(latest.getStatus())
                        && latest.getStartedAt() != null
                        && latest.getStartedAt().isBefore(now.minus(definition.stuckAfter())),
                latest,
                latest == null ? null : stuckMessage(definition, latest, now),
                now
        );
        boolean missingSuccess = shouldCheckMissingSuccess(definition, now)
                && (lastSuccess == null || lastSuccess.getFinishedAt() == null
                || lastSuccess.getFinishedAt().isBefore(now.minus(definition.expectedSuccessWithin())));
        changed += applyCondition(
                definition,
                ScheduledJobAlertType.MISSING_SUCCESS,
                missingSuccess,
                lastSuccess == null ? latest : lastSuccess,
                missingSuccessMessage(definition, lastSuccess, now),
                now
        );
        return changed;
    }

    private boolean shouldCheckMissingSuccess(ScheduledJobAlertDefinition definition, Instant now) {
        Instant earliestCheck = appStartedAt.plus(max(startupGrace, definition.expectedSuccessWithin()));
        return !now.isBefore(earliestCheck);
    }

    private int applyCondition(
            ScheduledJobAlertDefinition definition,
            ScheduledJobAlertType alertType,
            boolean active,
            ScheduledJobRun relatedRun,
            String message,
            Instant now
    ) {
        Optional<ScheduledJobAlertState> activeAlert = alerts.findFirstByJobNameAndAlertTypeAndStatusOrderByLastDetectedAtDesc(
                definition.jobName(),
                alertType,
                ScheduledJobAlertStatus.ACTIVE
        );
        if (active) {
            if (activeAlert.isPresent()) {
                ScheduledJobAlertState alert = activeAlert.get();
                alert.setLastDetectedAt(now);
                alert.setSeverity(definition.severity());
                alert.setLastRunId(relatedRun == null ? null : relatedRun.getId());
                alert.setMessage(trim(message, 1900));
                alerts.save(alert);
                return 0;
            }
            ScheduledJobAlertState alert = new ScheduledJobAlertState();
            alert.setJobName(definition.jobName());
            alert.setAlertType(alertType);
            alert.setStatus(ScheduledJobAlertStatus.ACTIVE);
            alert.setSeverity(definition.severity());
            alert.setFirstDetectedAt(now);
            alert.setLastDetectedAt(now);
            alert.setLastRunId(relatedRun == null ? null : relatedRun.getId());
            alert.setMessage(trim(message, 1900));
            ScheduledJobAlertState saved = alerts.save(alert);
            if (emailService.sendOpened(saved, definition)) {
                saved.setLastEmailSentAt(Instant.now());
                alerts.save(saved);
            }
            return 1;
        }
        if (activeAlert.isEmpty()) return 0;
        ScheduledJobAlertState alert = activeAlert.get();
        alert.setStatus(ScheduledJobAlertStatus.RESOLVED);
        alert.setResolvedAt(now);
        alert.setLastDetectedAt(now);
        ScheduledJobAlertState saved = alerts.save(alert);
        if (emailService.sendRecovered(saved, definition)) {
            saved.setLastRecoveryEmailSentAt(Instant.now());
            alerts.save(saved);
        }
        return 1;
    }

    private ScheduledJobAlertDto toDto(ScheduledJobAlertState alert) {
        ScheduledJobAlertDefinition definition = ScheduledJobAlertDefinitions.find(alert.getJobName()).orElse(null);
        return new ScheduledJobAlertDto(
                alert.getId(),
                alert.getJobName(),
                definition == null ? alert.getJobName() : definition.label(),
                alert.getAlertType() == null ? null : alert.getAlertType().name(),
                alert.getStatus() == null ? null : alert.getStatus().name(),
                alert.getSeverity() == null ? null : alert.getSeverity().name(),
                iso(alert.getFirstDetectedAt()),
                iso(alert.getLastDetectedAt()),
                iso(alert.getResolvedAt()),
                iso(alert.getLastEmailSentAt()),
                alert.getLastRunId(),
                alert.getMessage()
        );
    }

    private static String failureMessage(ScheduledJobAlertDefinition definition, ScheduledJobRun latest) {
        String error = latest.getErrorMessage() == null || latest.getErrorMessage().isBlank()
                ? "Latest run failed without a stored error message."
                : latest.getErrorMessage();
        return "Latest run for " + definition.label() + " failed at " + iso(latest.getFinishedAt()) + ". " + error;
    }

    private static String stuckMessage(ScheduledJobAlertDefinition definition, ScheduledJobRun latest, Instant now) {
        Duration runningFor = latest.getStartedAt() == null ? Duration.ZERO : Duration.between(latest.getStartedAt(), now);
        return "Latest run for " + definition.label() + " has been RUNNING for " + formatDuration(runningFor)
                + ", longer than stuck threshold " + formatDuration(definition.stuckAfter()) + ".";
    }

    private static String missingSuccessMessage(ScheduledJobAlertDefinition definition, ScheduledJobRun lastSuccess, Instant now) {
        if (lastSuccess == null || lastSuccess.getFinishedAt() == null) {
            return "No successful run has been recorded for " + definition.label()
                    + " after the startup grace period. Expected success within " + formatDuration(definition.expectedSuccessWithin()) + ".";
        }
        Duration age = Duration.between(lastSuccess.getFinishedAt(), now);
        return "Last successful run for " + definition.label() + " finished " + formatDuration(age)
                + " ago, older than expected window " + formatDuration(definition.expectedSuccessWithin()) + ".";
    }

    private static Duration max(Duration a, Duration b) {
        return a.compareTo(b) >= 0 ? a : b;
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
        if (days > 0) return days + "d " + hours + "h";
        if (hours > 0) return hours + "h " + minutes + "m";
        if (minutes > 0) return minutes + "m";
        return seconds + "s";
    }

    private static String trim(String value, int max) {
        if (value == null) return null;
        String cleaned = value.replaceAll("[\\r\\n\\t]+", " ").trim();
        return cleaned.length() <= max ? cleaned : cleaned.substring(0, max) + "…";
    }

    public record ScheduledJobAlertDto(
            Long id,
            String jobName,
            String label,
            String alertType,
            String status,
            String severity,
            String firstDetectedAt,
            String lastDetectedAt,
            String resolvedAt,
            String lastEmailSentAt,
            Long lastRunId,
            String message
    ) {}
}
