# Phase 1 selected production-readiness changes

This patch assumes the previous selected Phase 0 patch has already been applied.

## Implemented

### Redis-backed rate limiting

- Added Redis support for auth and widget rate limits.
- Local/testing default is `auto`: use Redis when available, otherwise fall back to memory.
- Production default is `redis`: fail closed if Redis is unavailable.

Important settings:

```yaml
APP_RATE_LIMIT_BACKEND=auto|memory|redis
APP_WIDGET_RATE_LIMIT_BACKEND=auto|memory|redis
SPRING_DATA_REDIS_HOST=redis
SPRING_DATA_REDIS_PORT=6379
```

### Distributed job locks

- Added ShedLock with a JDBC/Postgres lock table.
- Added locks to:
  - reminder template notifications
  - one-hour reminders
  - analytics report scheduler
  - inbox pending attachment cleanup

### Observability

- Added Prometheus metrics endpoint.
- Added OpenTelemetry tracing dependencies/config.
- Added JSON structured logs through Logstash Logback encoder.
- Added request/user/company/tenant/request-id MDC fields.

Useful endpoints:

```text
/actuator/health
/actuator/prometheus
```

### Production indexes

- Added an idempotent `OperationalSchemaMigration`.
- It creates:
  - `shedlock` table
  - tenant/user/client/session/billing/guest/widget indexes

This is still a bridge until the app moves fully to Flyway/Liquibase.

### Turnstile on public widget actions

- Added `APP_WIDGET_TURNSTILE_REQUIRED_FOR_PUBLIC_ACTIONS`.
- Production defaults this to `true`.
- Local/staging defaults this to `false` for easier testing.
- Public booking and guest-session creation now use `verifyForPublicAction(...)`.

### Server-side package limits

- Added backend package entitlement checks.
- `/api/billing/**` requires Professional, Premium, or Custom.
- `/api/inbox/**` requires Premium or Custom.
- New staff users are blocked when the active user quota is reached.

### Testcontainers integration tests

- Added a Postgres Testcontainers test for the operational schema migration.
- Added package entitlement unit tests.

### Basic load tests

- Added a k6 widget smoke test.

Run:

```bash
k6 run -e BASE_URL=http://localhost:4000 -e TENANT_CODE=yourTenantCode load-tests/k6/widget-smoke.js
```

### Staging environment

- Added `docker-compose.staging.yml`.
- Added `.env.staging.example`.
- Added staging documentation in `docs/STAGING_ENVIRONMENT.md`.
- Added Redis to production compose for production-grade rate limits and job support.

## Verification attempted

I attempted to run the backend Maven compile/tests, but Maven did not complete in this sandbox because the wrapper/dependency download hung without internet access. Docker is also not installed in this sandbox, so I could not validate the Compose file here.

Please run locally/CI:

```bash
cd backend
./mvnw test

cd ..
docker compose -f docker-compose.staging.yml --env-file .env.staging.example config

npm run load:widget -- -e BASE_URL=http://localhost:4000 -e TENANT_CODE=yourTenantCode
```

## Later hardening

- Replace `OperationalSchemaMigration` with Flyway/Liquibase.
- Move rate limit key TTLs and Redis failures to dashboards/alerts.
- Add booking/write-path k6 tests using disposable staging data.
- Add Sentry if you prefer Sentry alerts in addition to OpenTelemetry.
