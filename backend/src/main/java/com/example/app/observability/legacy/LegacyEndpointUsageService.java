package com.example.app.observability.legacy;

import io.micrometer.core.instrument.Measurement;
import io.micrometer.core.instrument.Meter;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Tag;
import io.micrometer.core.instrument.Timer;
import jakarta.servlet.http.HttpServletRequest;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class LegacyEndpointUsageService {
    public static final String CALLS_METER = "legacy_endpoint_calls";
    public static final String DURATION_METER = "legacy_endpoint_duration";

    private static final Logger auditLog = LoggerFactory.getLogger("legacy-endpoint-audit");

    private final MeterRegistry meterRegistry;
    private final Map<LegacyEndpointDefinition, LastSeen> lastSeen = new ConcurrentHashMap<>();

    public LegacyEndpointUsageService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    public void record(
            LegacyEndpointDefinition endpoint,
            HttpServletRequest request,
            int status,
            long durationNanos,
            Exception failure
    ) {
        String method = safeTag(request == null ? endpoint.httpMethod() : request.getMethod());
        String outcome = outcome(status, failure);
        meterRegistry.counter(
                CALLS_METER,
                "endpoint", endpoint.id(),
                "method", method,
                "outcome", outcome
        ).increment();
        Timer.builder(DURATION_METER)
                .tag("endpoint", endpoint.id())
                .tag("method", method)
                .register(meterRegistry)
                .record(Math.max(0L, durationNanos), TimeUnit.NANOSECONDS);

        String client = clientDescription(request);
        lastSeen.put(endpoint, new LastSeen(Instant.now().toString(), status, outcome, client));
        auditLog.info(
                "legacy_endpoint_call endpoint={} method={} path={} status={} outcome={} durationMs={} replacement={} client={} failure={}",
                endpoint.id(),
                request == null ? endpoint.httpMethod() : request.getMethod(),
                request == null ? endpoint.path() : request.getRequestURI(),
                status,
                outcome,
                Math.max(0L, TimeUnit.NANOSECONDS.toMillis(durationNanos)),
                endpoint.replacement().isBlank() ? "none" : endpoint.replacement(),
                client,
                failure == null ? "none" : failure.getClass().getSimpleName()
        );
    }

    public LegacyEndpointReport report() {
        List<LegacyEndpointSnapshot> endpoints = new ArrayList<>();
        for (LegacyEndpointDefinition endpoint : LegacyEndpointDefinition.values()) {
            double successful = count(endpoint.id(), "success");
            double clientError = count(endpoint.id(), "client_error");
            double serverError = count(endpoint.id(), "server_error");
            double other = count(endpoint.id(), "other");
            LastSeen seen = lastSeen.get(endpoint);
            endpoints.add(new LegacyEndpointSnapshot(
                    endpoint.id(),
                    endpoint.category(),
                    endpoint.httpMethod(),
                    endpoint.path(),
                    endpoint.replacement(),
                    endpoint.reason(),
                    successful + clientError + serverError + other,
                    successful,
                    clientError,
                    serverError,
                    other,
                    seen == null ? null : seen.at(),
                    seen == null ? null : seen.status(),
                    seen == null ? null : seen.outcome(),
                    seen == null ? null : seen.client()
            ));
        }
        return new LegacyEndpointReport(
                Instant.now().toString(),
                "Counts and last-seen values cover the current backend process. Use retained Prometheus data and the legacy-endpoint-audit log across the full observation window before deleting a route.",
                endpoints
        );
    }

    private double count(String endpointId, String outcome) {
        double total = 0d;
        for (Meter meter : meterRegistry.getMeters()) {
            Meter.Id id = meter.getId();
            if (!CALLS_METER.equals(id.getName())) continue;
            if (!hasTag(id, "endpoint", endpointId) || !hasTag(id, "outcome", outcome)) continue;
            for (Measurement measurement : meter.measure()) {
                if ("COUNT".equals(measurement.getStatistic().name())) {
                    total += measurement.getValue();
                }
            }
        }
        return total;
    }

    private static boolean hasTag(Meter.Id id, String key, String value) {
        for (Tag tag : id.getTags()) {
            if (key.equals(tag.getKey()) && value.equals(tag.getValue())) return true;
        }
        return false;
    }

    static String outcome(int status, Exception failure) {
        if (failure != null || status >= 500) return "server_error";
        if (status >= 400) return "client_error";
        if (status >= 200 && status < 400) return "success";
        return "other";
    }

    private static String clientDescription(HttpServletRequest request) {
        if (request == null) return "unknown";
        String platform = firstNonBlank(request.getHeader("X-Platform"), request.getHeader("X-Client-Platform"));
        String version = firstNonBlank(request.getHeader("X-App-Version"), request.getHeader("X-Client-Version"));
        String userAgent = trimToLength(request.getHeader("User-Agent"), 240);
        StringBuilder value = new StringBuilder();
        if (platform != null) value.append("platform=").append(trimToLength(platform, 60));
        if (version != null) {
            if (!value.isEmpty()) value.append(';');
            value.append("version=").append(trimToLength(version, 60));
        }
        if (userAgent != null) {
            if (!value.isEmpty()) value.append(';');
            value.append("ua=").append(userAgent);
        }
        return value.isEmpty() ? "unknown" : value.toString();
    }

    private static String safeTag(String value) {
        if (value == null || value.isBlank()) return "unknown";
        return value.trim().toLowerCase(Locale.ROOT).replaceAll("[^a-z0-9_.-]", "_");
    }

    private static String firstNonBlank(String first, String second) {
        if (first != null && !first.isBlank()) return first.trim();
        if (second != null && !second.isBlank()) return second.trim();
        return null;
    }

    private static String trimToLength(String value, int maxLength) {
        if (value == null || value.isBlank()) return null;
        String trimmed = value.trim().replace('\n', ' ').replace('\r', ' ');
        return trimmed.length() <= maxLength ? trimmed : trimmed.substring(0, maxLength);
    }

    private record LastSeen(String at, int status, String outcome, String client) {}

    public record LegacyEndpointReport(
            String generatedAt,
            String scope,
            List<LegacyEndpointSnapshot> endpoints
    ) {}

    public record LegacyEndpointSnapshot(
            String id,
            String category,
            String method,
            String path,
            String replacement,
            String reason,
            double calls,
            double successfulCalls,
            double clientErrorCalls,
            double serverErrorCalls,
            double otherCalls,
            String lastSeenAt,
            Integer lastStatus,
            String lastOutcome,
            String lastClient
    ) {}
}
