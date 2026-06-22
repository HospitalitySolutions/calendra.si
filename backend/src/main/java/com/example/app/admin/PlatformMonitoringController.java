package com.example.app.admin;

import com.example.app.billing.BillFiscalStatus;
import com.example.app.billing.BillPaymentStatus;
import com.example.app.billing.BillRepository;
import com.example.app.monitoring.ScheduledJobAlertService;
import com.example.app.monitoring.ScheduledJobMonitoringService;
import com.example.app.stripe.StripeWebhookEventRepository;
import io.micrometer.core.instrument.Measurement;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import java.io.File;
import java.io.IOException;
import java.lang.management.ManagementFactory;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.FileStore;
import java.nio.file.Files;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import javax.sql.DataSource;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.redis.connection.RedisConnection;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/platform-admin/monitoring")
@PreAuthorize("hasRole('SUPER_ADMIN')")
public class PlatformMonitoringController {
    private final DataSource dataSource;
    private final ObjectProvider<StringRedisTemplate> redisProvider;
    private final MeterRegistry meterRegistry;
    private final StripeWebhookEventRepository stripeWebhookEvents;
    private final BillRepository bills;
    private final ScheduledJobMonitoringService scheduledJobs;
    private final ScheduledJobAlertService scheduledJobAlerts;
    private final String publicBaseUrl;

    public PlatformMonitoringController(
            DataSource dataSource,
            ObjectProvider<StringRedisTemplate> redisProvider,
            MeterRegistry meterRegistry,
            StripeWebhookEventRepository stripeWebhookEvents,
            BillRepository bills,
            ScheduledJobMonitoringService scheduledJobs,
            ScheduledJobAlertService scheduledJobAlerts,
            @Value("${app.public-base-url:}") String publicBaseUrl
    ) {
        this.dataSource = dataSource;
        this.redisProvider = redisProvider;
        this.meterRegistry = meterRegistry;
        this.stripeWebhookEvents = stripeWebhookEvents;
        this.bills = bills;
        this.scheduledJobs = scheduledJobs;
        this.scheduledJobAlerts = scheduledJobAlerts;
        this.publicBaseUrl = publicBaseUrl == null ? "" : publicBaseUrl.trim();
    }

    @GetMapping("/status")
    public MonitoringStatusDto status() {
        List<MonitoringCheckDto> checks = new ArrayList<>();
        checks.add(backendCheck());
        checks.add(databaseCheck());
        checks.add(redisCheck());
        checks.add(diskCheck());
        checks.add(scheduledJobsCheck());
        checks.add(frontendCheck());

        List<MonitoringMetricDto> metrics = new ArrayList<>();
        metrics.add(metric(
                "5xx errors",
                formatNumber(countByNameAndTag("http.server.requests", "outcome", "SERVER_ERROR")),
                statusForCount(countByNameAndTag("http.server.requests", "outcome", "SERVER_ERROR"), 1, 10),
                "Backend HTTP requests with SERVER_ERROR outcome since the process started."
        ));
        metrics.add(metric(
                "Failed widget bookings",
                formatNumber(countByNameAndTags("widget_public_attempts", List.of(tag("action", "booking"), tag("outcome", "failed")))),
                statusForCount(countByNameAndTags("widget_public_attempts", List.of(tag("action", "booking"), tag("outcome", "failed"))), 1, 5),
                "Public website-widget booking failures tracked since the process started."
        ));
        metrics.add(metric(
                "Cancelled/failed Stripe payments",
                formatNumber(safeBillCountByPaymentStatus(BillPaymentStatus.CANCELLED)),
                statusForCount(safeBillCountByPaymentStatus(BillPaymentStatus.CANCELLED), 1, 20),
                "Bills currently stored with cancelled payment status, including expired or failed Stripe checkout sessions."
        ));
        metrics.add(metric(
                "Failed Stripe webhooks",
                formatNumber(safeStripeWebhookCount("failed")),
                statusForCount(safeStripeWebhookCount("failed"), 1, 5),
                "Stripe webhook events that were received but failed while processing."
        ));
        metrics.add(metric(
                "Failed fiscalization",
                formatNumber(safeBillCountByFiscalStatus(BillFiscalStatus.FAILED)),
                statusForCount(safeBillCountByFiscalStatus(BillFiscalStatus.FAILED), 1, 5),
                "Bills with fiscal status FAILED."
        ));
        metrics.add(metric(
                "Open-bill scheduler failures",
                formatNumber(countByNameAndTag("open_bill_sync.failures", null, null)),
                statusForCount(countByNameAndTag("open_bill_sync.failures", null, null), 1, 5),
                "Open-bill sync failures tracked by Micrometer since the process started."
        ));
        metrics.add(metric(
                "Auth rate-limit blocks",
                formatNumber(countByNameAndTag("auth_rate_limit_blocked", null, null)),
                statusForCount(countByNameAndTag("auth_rate_limit_blocked", null, null), 5, 30),
                "Login/signup/password-reset attempts blocked by auth rate limiting since the process started."
        ));

        String overallStatus = checks.stream().anyMatch(c -> "DOWN".equals(c.status()) || "CRITICAL".equals(c.status()))
                ? "CRITICAL"
                : checks.stream().anyMatch(c -> "WARN".equals(c.status())) ? "WARN" : "UP";

        return new MonitoringStatusDto(
                Instant.now().toString(),
                overallStatus,
                formatDuration(ManagementFactory.getRuntimeMXBean().getUptime()),
                checks,
                metrics,
                "Use this admin page for quick status checks. Use external uptime/log tools for real alerts, full logs, and backup monitoring."
        );
    }

    @GetMapping("/scheduled-jobs")
    public List<ScheduledJobMonitoringService.ScheduledJobStatusDto> scheduledJobStatuses() {
        return scheduledJobs.statuses();
    }

    @GetMapping("/scheduled-jobs/{jobName}/runs")
    public List<ScheduledJobMonitoringService.ScheduledJobRunDto> scheduledJobRuns(@PathVariable String jobName) {
        return scheduledJobs.recentRuns(jobName);
    }

    @GetMapping("/scheduled-job-alerts")
    public List<ScheduledJobAlertService.ScheduledJobAlertDto> scheduledJobAlerts() {
        return scheduledJobAlerts.activeAlertDtos();
    }

    private MonitoringCheckDto backendCheck() {
        return check("backend", "Backend API", "UP", "Responding", "JVM uptime " + formatDuration(ManagementFactory.getRuntimeMXBean().getUptime()));
    }

    private MonitoringCheckDto databaseCheck() {
        try (var connection = dataSource.getConnection()) {
            boolean valid = connection.isValid(2);
            return check("database", "Database", valid ? "UP" : "DOWN", valid ? "Connection valid" : "Connection invalid", connection.getMetaData().getURL());
        } catch (Exception ex) {
            return check("database", "Database", "DOWN", "Database check failed", safeMessage(ex));
        }
    }

    private MonitoringCheckDto redisCheck() {
        StringRedisTemplate redis = redisProvider.getIfAvailable();
        if (redis == null) {
            return check("redis", "Redis", "WARN", "Redis template not available", "Redis-backed rate limits/realtime may be disabled in this profile.");
        }
        try {
            String pong = redis.execute((RedisConnection connection) -> connection.ping());
            boolean ok = pong == null || "PONG".equalsIgnoreCase(pong);
            return check("redis", "Redis", ok ? "UP" : "WARN", ok ? "Ping successful" : "Unexpected ping response", pong == null ? "PONG" : pong);
        } catch (Exception ex) {
            return check("redis", "Redis", "DOWN", "Redis check failed", safeMessage(ex));
        }
    }

    private MonitoringCheckDto diskCheck() {
        try {
            FileStore store = Files.getFileStore(new File(".").toPath().toAbsolutePath());
            long total = store.getTotalSpace();
            long usable = store.getUsableSpace();
            double freePct = total <= 0 ? 0d : (usable * 100d / total);
            String status = freePct < 10d ? "CRITICAL" : freePct < 20d ? "WARN" : "UP";
            return check("disk", "Disk space", status, formatPercent(freePct) + " free", formatBytes(usable) + " free of " + formatBytes(total));
        } catch (IOException ex) {
            return check("disk", "Disk space", "WARN", "Disk check unavailable", safeMessage(ex));
        }
    }

    private MonitoringCheckDto scheduledJobsCheck() {
        try {
            List<ScheduledJobMonitoringService.ScheduledJobStatusDto> statuses = scheduledJobs.statuses();
            long critical = statuses.stream().filter(s -> "CRITICAL".equalsIgnoreCase(s.health())).count();
            long warn = statuses.stream().filter(s -> "WARN".equalsIgnoreCase(s.health())).count();
            String status = critical > 0 ? "CRITICAL" : warn > 0 ? "WARN" : "UP";
            String summary = critical > 0
                    ? critical + " critical job" + (critical == 1 ? "" : "s")
                    : warn > 0
                    ? warn + " job warning" + (warn == 1 ? "" : "s")
                    : "All tracked jobs OK";
            return check("scheduled-jobs", "Scheduled jobs", status, summary, "Tracks last run, last success, failures and stuck jobs for platform background work.");
        } catch (Exception ex) {
            return check("scheduled-jobs", "Scheduled jobs", "WARN", "Job status unavailable", safeMessage(ex));
        }
    }

    private MonitoringCheckDto frontendCheck() {
        if (publicBaseUrl.isBlank()) {
            return check("frontend", "Frontend availability", "WARN", "Missing public URL", "APP_PUBLIC_BASE_URL is not configured. Use an external uptime monitor for real public availability alerts.");
        }
        return check("frontend", "Frontend availability", "UP", "Configured", "Public URL configured: " + publicBaseUrl + ". This page loading confirms the admin frontend bundle is reachable for you; use an external uptime monitor for real public availability alerts.");
    }

    private long safeStripeWebhookCount(String status) {
        try {
            return stripeWebhookEvents.countByProcessingStatusIgnoreCase(status);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private long safeBillCountByFiscalStatus(BillFiscalStatus status) {
        try {
            return bills.countByFiscalStatus(status);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private long safeBillCountByPaymentStatus(String status) {
        try {
            return bills.countByPaymentStatus(status);
        } catch (Exception ignored) {
            return 0L;
        }
    }

    private double countByNameAndTag(String meterName, String tagKey, String tagValue) {
        List<Tag> tags = tagKey == null || tagValue == null ? List.of() : List.of(tag(tagKey, tagValue));
        return countByNameAndTags(meterName, tags);
    }

    private double countByNameAndTags(String meterName, List<Tag> requiredTags) {
        double total = 0d;
        for (Meter meter : meterRegistry.getMeters()) {
            Meter.Id id = meter.getId();
            if (!meterName.equals(id.getName())) continue;
            if (!hasRequiredTags(id, requiredTags)) continue;
            for (Measurement measurement : meter.measure()) {
                if ("COUNT".equals(measurement.getStatistic().name())) {
                    total += measurement.getValue();
                }
            }
        }
        return total;
    }

    private static boolean hasRequiredTags(Meter.Id id, List<Tag> requiredTags) {
        for (Tag required : requiredTags) {
            String actual = id.getTag(required.getKey());
            if (!required.getValue().equals(actual)) return false;
        }
        return true;
    }

    private static Tag tag(String key, String value) {
        return Tag.of(key, value);
    }

    private static MonitoringCheckDto check(String key, String label, String status, String summary, String detail) {
        return new MonitoringCheckDto(key, label, status, summary, detail == null ? "" : detail);
    }

    private static MonitoringMetricDto metric(String label, String value, String status, String description) {
        return new MonitoringMetricDto(label, value, status, description);
    }

    private static String statusForCount(double value, double warnAt, double criticalAt) {
        if (value >= criticalAt) return "CRITICAL";
        if (value >= warnAt) return "WARN";
        return "UP";
    }

    private static String formatNumber(double value) {
        if (Math.rint(value) == value) {
            return Long.toString((long) value);
        }
        return BigDecimal.valueOf(value).setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
    }

    private static String formatBytes(long bytes) {
        if (bytes < 1024) return bytes + " B";
        double value = bytes;
        String[] units = {"KB", "MB", "GB", "TB"};
        int unit = -1;
        do {
            value = value / 1024d;
            unit++;
        } while (value >= 1024d && unit < units.length - 1);
        return BigDecimal.valueOf(value).setScale(1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() + " " + units[unit];
    }

    private static String formatPercent(double pct) {
        return BigDecimal.valueOf(pct).setScale(1, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString() + "%";
    }

    private static String formatDuration(long millis) {
        long totalSeconds = Math.max(0L, millis / 1000L);
        long days = totalSeconds / 86_400L;
        long hours = (totalSeconds % 86_400L) / 3_600L;
        long minutes = (totalSeconds % 3_600L) / 60L;
        if (days > 0) return String.format(Locale.ROOT, "%dd %dh %dm", days, hours, minutes);
        if (hours > 0) return String.format(Locale.ROOT, "%dh %dm", hours, minutes);
        return String.format(Locale.ROOT, "%dm", minutes);
    }

    private static String safeMessage(Exception ex) {
        String message = ex == null ? "" : ex.getMessage();
        if (message == null || message.isBlank()) return HttpStatus.INTERNAL_SERVER_ERROR.getReasonPhrase();
        return message.length() > 240 ? message.substring(0, 240) + "…" : message;
    }

    public record MonitoringStatusDto(
            String generatedAt,
            String overallStatus,
            String uptime,
            List<MonitoringCheckDto> checks,
            List<MonitoringMetricDto> metrics,
            String note
    ) {}

    public record MonitoringCheckDto(String key, String label, String status, String summary, String detail) {}

    public record MonitoringMetricDto(String label, String value, String status, String description) {}
}
