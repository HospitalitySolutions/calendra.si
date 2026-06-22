package com.example.app.monitoring;

import java.net.InetAddress;
import java.time.Duration;
import java.time.Instant;
import java.util.Locale;
import java.util.concurrent.Callable;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.transaction.TransactionDefinition;

@Service
public class ScheduledJobTrackerService {
    private static final Logger log = LoggerFactory.getLogger(ScheduledJobTrackerService.class);

    public static final String STATUS_RUNNING = "RUNNING";
    public static final String STATUS_SUCCESS = "SUCCESS";
    public static final String STATUS_FAILED = "FAILED";
    public static final String STATUS_SKIPPED = "SKIPPED";

    private final ScheduledJobRunRepository runs;
    private final TransactionTemplate requiresNew;
    private final String instanceId;

    public ScheduledJobTrackerService(ScheduledJobRunRepository runs, PlatformTransactionManager txManager) {
        this.runs = runs;
        this.requiresNew = new TransactionTemplate(txManager);
        this.requiresNew.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        this.instanceId = resolveInstanceId();
    }

    public void run(String jobName, Runnable action) {
        run(jobName, () -> {
            action.run();
            return 0;
        });
    }

    public int run(String jobName, Callable<Integer> action) {
        ScheduledJobRun run = null;
        Instant startedAt = Instant.now();
        try {
            run = start(jobName, startedAt);
        } catch (Exception ex) {
            log.warn("Could not create scheduled job run row for {}. Running job without tracking: {}", jobName, safeMessage(ex));
        }

        try {
            Integer processed = action.call();
            int count = processed == null ? 0 : Math.max(0, processed);
            finish(run, STATUS_SUCCESS, count, null, startedAt);
            return count;
        } catch (Exception ex) {
            finish(run, STATUS_FAILED, null, ex, startedAt);
            if (ex instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new IllegalStateException(ex);
        }
    }

    public void skipped(String jobName, String reason) {
        Instant startedAt = Instant.now();
        ScheduledJobRun run = null;
        try {
            run = start(jobName, startedAt);
        } catch (Exception ex) {
            log.warn("Could not create skipped scheduled job run row for {}: {}", jobName, safeMessage(ex));
            return;
        }
        finish(run, STATUS_SKIPPED, 0, reason, startedAt);
    }

    private void finish(ScheduledJobRun run, String status, Integer recordsProcessed, Exception ex, Instant fallbackStartedAt) {
        String message = ex == null ? null : safeMessage(ex);
        finish(run, status, recordsProcessed, message, fallbackStartedAt);
    }

    private void finish(ScheduledJobRun run, String status, Integer recordsProcessed, String message, Instant fallbackStartedAt) {
        if (run == null) return;
        try {
            finishInNewTransaction(run.getId(), status, recordsProcessed, message, fallbackStartedAt);
        } catch (Exception trackingEx) {
            log.warn("Could not finish scheduled job run {} for {}: {}", run.getId(), run.getJobName(), safeMessage(trackingEx));
        }
    }

    private ScheduledJobRun start(String jobName, Instant startedAt) {
        return requiresNew.execute(status -> {
            ScheduledJobRun run = new ScheduledJobRun();
            run.setJobName(normalizeJobName(jobName));
            run.setStatus(STATUS_RUNNING);
            run.setStartedAt(startedAt);
            run.setInstanceId(instanceId);
            run.setLockedBy(instanceId);
            run.setRecordsProcessed(0);
            return runs.save(run);
        });
    }

    private void finishInNewTransaction(Long id, String status, Integer recordsProcessed, String errorMessage, Instant fallbackStartedAt) {
        requiresNew.executeWithoutResult(tx -> {
            ScheduledJobRun run = runs.findById(id).orElse(null);
            if (run == null) return;
            Instant finishedAt = Instant.now();
            Instant startedAt = run.getStartedAt() == null ? fallbackStartedAt : run.getStartedAt();
            run.setStatus(status == null || status.isBlank() ? STATUS_SUCCESS : status.trim().toUpperCase(Locale.ROOT));
            run.setFinishedAt(finishedAt);
            run.setDurationMs(Duration.between(startedAt, finishedAt).toMillis());
            run.setRecordsProcessed(recordsProcessed == null ? 0 : Math.max(0, recordsProcessed));
            run.setErrorMessage(errorMessage == null || errorMessage.isBlank() ? null : trim(errorMessage, 1900));
            runs.save(run);
        });
    }

    private static String normalizeJobName(String jobName) {
        String value = jobName == null ? "unknown" : jobName.trim();
        if (value.isBlank()) return "unknown";
        return value.length() > 120 ? value.substring(0, 120) : value;
    }

    private static String resolveInstanceId() {
        String env = System.getenv("HOSTNAME");
        if (env != null && !env.isBlank()) return trim(env.trim(), 160);
        try {
            return trim(InetAddress.getLocalHost().getHostName(), 160);
        } catch (Exception ignored) {
            return "unknown-instance";
        }
    }

    private static String safeMessage(Exception ex) {
        if (ex == null) return "Unknown error";
        String message = ex.getMessage();
        if (message == null || message.isBlank()) message = ex.getClass().getSimpleName();
        return trim(message.replaceAll("[\\r\\n\\t]+", " "), 1900);
    }

    private static String trim(String value, int max) {
        if (value == null) return "";
        return value.length() <= max ? value : value.substring(0, max) + "…";
    }
}
