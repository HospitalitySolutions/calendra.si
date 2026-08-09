# Backend performance profiling

Phase 6 adds runtime HTTP percentile metrics and a super-admin diagnostics endpoint:

`GET /api/platform-admin/monitoring/performance?limit=25`

The response reports the slowest normalized Spring MVC routes, Hikari connection-pool usage, and
(top when available) PostgreSQL statement fingerprints from `pg_stat_statements`.

## pg_stat_statements

The application does **not** create or enable this extension automatically because PostgreSQL may
require a server/parameter-group change and restart. Enable it deliberately in staging first.

Typical PostgreSQL setup:

1. Add `pg_stat_statements` to `shared_preload_libraries` for the database server/parameter group.
2. Restart/reboot PostgreSQL if the server reports that a restart is required.
3. Run once in the Calendra database with an appropriately privileged database user:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

4. Exercise the application normally, then call the performance endpoint as a SUPER_ADMIN.

Useful direct SQL when diagnosing a specific period:

```sql
SELECT queryid,
       calls,
       round(mean_exec_time::numeric, 2) AS mean_ms,
       round(max_exec_time::numeric, 2) AS max_ms,
       round(total_exec_time::numeric, 2) AS total_ms,
       rows,
       query
FROM pg_stat_statements
WHERE dbid = (SELECT oid FROM pg_database WHERE datname = current_database())
ORDER BY total_exec_time DESC
LIMIT 25;
```

Reset statistics only when you intentionally want a fresh measurement window:

```sql
SELECT pg_stat_statements_reset();
```

## Slow request logs

Requests over the configured threshold are logged without query parameters or request bodies.
Defaults:

- staging: 500 ms
- production: 750 ms

Override with `APP_PERFORMANCE_SLOW_REQUEST_THRESHOLD_MS`.

## Hibernate read batching

`hibernate.default_batch_fetch_size` defaults to 64 and JDBC fetch size to 100. Override with:

- `HIBERNATE_DEFAULT_BATCH_FETCH_SIZE`
- `HIBERNATE_JDBC_FETCH_SIZE`

Do not enable verbose Hibernate SQL/statistics logging in production just to profile latency; use
`pg_stat_statements`, Micrometer and targeted `EXPLAIN (ANALYZE, BUFFERS)` on staging instead.
