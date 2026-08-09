package com.example.app.observability;

import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import io.micrometer.core.instrument.distribution.HistogramSnapshot;
import io.micrometer.core.instrument.distribution.ValueAtPercentile;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.TimeUnit;
import javax.sql.DataSource;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * Super-admin performance diagnostics backed by the metrics already collected by Spring/Micrometer.
 *
 * <p>This deliberately does not enable SQL logging or Hibernate statistics in production. HTTP
 * latency comes from {@code http.server.requests}; SQL fingerprints are read from PostgreSQL's
 * optional {@code pg_stat_statements} extension when the database administrator has enabled it.</p>
 */
@Service
public class BackendPerformanceDiagnosticsService {
    private static final int DEFAULT_LIMIT = 25;
    private static final int MAX_LIMIT = 100;

    private final MeterRegistry meterRegistry;
    private final JdbcTemplate jdbcTemplate;

    public BackendPerformanceDiagnosticsService(MeterRegistry meterRegistry, DataSource dataSource) {
        this.meterRegistry = meterRegistry;
        this.jdbcTemplate = new JdbcTemplate(dataSource);
    }

    public PerformanceSnapshot snapshot(Integer requestedLimit) {
        int limit = requestedLimit == null ? DEFAULT_LIMIT : Math.max(5, Math.min(MAX_LIMIT, requestedLimit));
        return new PerformanceSnapshot(
                Instant.now().toString(),
                httpEndpoints(limit),
                databasePool(),
                postgresStatements(limit)
        );
    }

    private List<HttpEndpointPerformance> httpEndpoints(int limit) {
        Collection<Timer> timers = meterRegistry.find("http.server.requests").timers();
        Map<EndpointKey, MutableEndpointStats> grouped = new LinkedHashMap<>();
        for (Timer timer : timers) {
            String uri = normalizeTag(timer, "uri", "UNKNOWN");
            if (uri.isBlank() || "UNKNOWN".equals(uri) || uri.startsWith("/api/actuator")
                    || uri.startsWith("/api/platform-admin/monitoring")) {
                continue;
            }
            String method = normalizeTag(timer, "method", "UNKNOWN");
            EndpointKey key = new EndpointKey(method, uri);
            MutableEndpointStats stats = grouped.computeIfAbsent(key, ignored -> new MutableEndpointStats());

            long count = timer.count();
            stats.count += count;
            stats.totalMs += timer.totalTime(TimeUnit.MILLISECONDS);
            stats.maxMs = Math.max(stats.maxMs, timer.max(TimeUnit.MILLISECONDS));
            stats.p95Ms = Math.max(stats.p95Ms, percentileMs(timer.takeSnapshot(), 0.95d));

            String status = timer.getId().getTag("status");
            if (status != null && status.startsWith("5")) {
                stats.errorCount += count;
            }
        }

        return grouped.entrySet().stream()
                .map(entry -> {
                    MutableEndpointStats stats = entry.getValue();
                    double meanMs = stats.count == 0 ? 0d : stats.totalMs / stats.count;
                    double p95Ms = stats.p95Ms > 0d ? stats.p95Ms : stats.maxMs;
                    return new HttpEndpointPerformance(
                            entry.getKey().method(),
                            entry.getKey().uri(),
                            stats.count,
                            round(meanMs),
                            round(p95Ms),
                            round(stats.maxMs),
                            round(stats.totalMs),
                            stats.errorCount
                    );
                })
                .sorted(Comparator
                        .comparingDouble(HttpEndpointPerformance::p95Ms).reversed()
                        .thenComparing(Comparator.comparingDouble(HttpEndpointPerformance::meanMs).reversed())
                        .thenComparing(Comparator.comparingLong(HttpEndpointPerformance::count).reversed()))
                .limit(limit)
                .toList();
    }

    private DatabasePoolPerformance databasePool() {
        return new DatabasePoolPerformance(
                gauge("hikaricp.connections.active", "jdbc.connections.active"),
                gauge("hikaricp.connections.idle", "jdbc.connections.idle"),
                gauge("hikaricp.connections.pending"),
                gauge("hikaricp.connections.max", "jdbc.connections.max"),
                gauge("hikaricp.connections.min", "jdbc.connections.min"),
                counterOrGauge("hikaricp.connections.timeout")
        );
    }

    private PgStatStatementsPerformance postgresStatements(int limit) {
        try {
            Boolean installed = jdbcTemplate.queryForObject(
                    "select exists(select 1 from pg_extension where extname = 'pg_stat_statements')",
                    Boolean.class
            );
            if (!Boolean.TRUE.equals(installed)) {
                return new PgStatStatementsPerformance(
                        false,
                        "pg_stat_statements is not installed in this database. Enable it on staging/production to inspect SQL fingerprints.",
                        List.of()
                );
            }

            List<PostgresStatementPerformance> statements = jdbcTemplate.query(
                    """
                    select queryid::text,
                           calls,
                           total_exec_time,
                           mean_exec_time,
                           max_exec_time,
                           rows,
                           query
                      from pg_stat_statements
                     where dbid = (select oid from pg_database where datname = current_database())
                       and query not ilike '%pg_stat_statements%'
                     order by total_exec_time desc
                     limit ?
                    """,
                    (rs, rowNum) -> new PostgresStatementPerformance(
                            rs.getString("queryid"),
                            rs.getLong("calls"),
                            round(rs.getDouble("mean_exec_time")),
                            round(rs.getDouble("max_exec_time")),
                            round(rs.getDouble("total_exec_time")),
                            rs.getLong("rows"),
                            normalizeSql(rs.getString("query"))
                    ),
                    limit
            );
            return new PgStatStatementsPerformance(true, null, statements);
        } catch (DataAccessException ex) {
            return new PgStatStatementsPerformance(
                    false,
                    "pg_stat_statements is unavailable to the application database user: " + safeMessage(ex),
                    List.of()
            );
        }
    }

    private double gauge(String... names) {
        for (String name : names) {
            var gauge = meterRegistry.find(name).gauge();
            if (gauge != null) {
                double value = gauge.value();
                if (!Double.isNaN(value) && !Double.isInfinite(value)) {
                    return round(value);
                }
            }
        }
        return 0d;
    }

    private double counterOrGauge(String... names) {
        double gaugeValue = gauge(names);
        if (gaugeValue != 0d) return gaugeValue;
        for (String name : names) {
            var counter = meterRegistry.find(name).counter();
            if (counter != null) {
                double value = counter.count();
                if (!Double.isNaN(value) && !Double.isInfinite(value)) {
                    return round(value);
                }
            }
        }
        return 0d;
    }

    private static String normalizeTag(Timer timer, String name, String fallback) {
        String value = timer.getId().getTag(name);
        return value == null || value.isBlank() ? fallback : value.trim();
    }

    private static double percentileMs(HistogramSnapshot snapshot, double requestedPercentile) {
        if (snapshot == null) return 0d;
        ValueAtPercentile[] percentiles = snapshot.percentileValues();
        if (percentiles == null || percentiles.length == 0) return 0d;
        ValueAtPercentile best = null;
        double bestDistance = Double.MAX_VALUE;
        for (ValueAtPercentile candidate : percentiles) {
            double distance = Math.abs(candidate.percentile() - requestedPercentile);
            if (distance < bestDistance) {
                best = candidate;
                bestDistance = distance;
            }
        }
        return best == null ? 0d : best.value(TimeUnit.MILLISECONDS);
    }

    private static String normalizeSql(String sql) {
        if (sql == null) return "";
        String normalized = sql.replaceAll("\\s+", " ").trim();
        return normalized.length() <= 600 ? normalized : normalized.substring(0, 597) + "...";
    }

    private static String safeMessage(DataAccessException ex) {
        String message = ex == null || ex.getMostSpecificCause() == null
                ? null
                : ex.getMostSpecificCause().getMessage();
        if (message == null || message.isBlank()) return "unknown database error";
        message = message.replaceAll("\\s+", " ").trim();
        return message.length() <= 240 ? message : message.substring(0, 237) + "...";
    }

    private static double round(double value) {
        if (Double.isNaN(value) || Double.isInfinite(value)) return 0d;
        return Math.round(value * 100d) / 100d;
    }

    private record EndpointKey(String method, String uri) {}

    private static final class MutableEndpointStats {
        long count;
        long errorCount;
        double totalMs;
        double maxMs;
        double p95Ms;
    }

    public record PerformanceSnapshot(
            String generatedAt,
            List<HttpEndpointPerformance> slowestHttpEndpoints,
            DatabasePoolPerformance databasePool,
            PgStatStatementsPerformance postgres
    ) {}

    public record HttpEndpointPerformance(
            String method,
            String uri,
            long count,
            double meanMs,
            double p95Ms,
            double maxMs,
            double totalMs,
            long serverErrorCount
    ) {}

    public record DatabasePoolPerformance(
            double active,
            double idle,
            double pending,
            double max,
            double min,
            double timeouts
    ) {}

    public record PgStatStatementsPerformance(
            boolean available,
            String message,
            List<PostgresStatementPerformance> statements
    ) {}

    public record PostgresStatementPerformance(
            String queryId,
            long calls,
            double meanMs,
            double maxMs,
            double totalMs,
            long rows,
            String query
    ) {}
}
