# Production hardening patch

This patch addresses the repository-level blockers identified in the 1,000-tenant / 10,000-daily-user readiness review.

## Implemented

- Replaced billing startup DDL with forward-only Flyway migration `V9__production_hardening.sql`.
- Added a data-preserving safety gate for obsolete singular waitlist tables. Empty tables are removed; non-empty tables abort deployment with an explicit migration error.
- Added clean-schema, V8-to-V9 upgrade, non-empty legacy-data, and full Spring/PostgreSQL context tests using Testcontainers.
- Added cluster-wide ShedLock scheduling and bounded batches for waitlist expiry.
- Changed scheduled inbox dispatch to query only due rows, cap each run, lock one row at a time, and use one transaction per message.
- Replaced full client-history scans on inbox write paths with indexed latest-open-conversation queries.
- Moved Zoom/Google meeting creation out of the booking transaction into a durable retrying worker. Booking confirmation waits until the generated link is persisted.
- Ensured pending, retrying, and failed online sessions are never counted as physical room usage.
- Added explicit production Hikari, Tomcat, JVM/container, graceful-shutdown, readiness, and scheduler settings.
- Added a two-backend Caddy topology that expects managed PostgreSQL and Redis.
- Added logical backup/restore-drill helpers and a production deployment runbook.
- Corrected the k6 readiness endpoint and health assertion, added load/spike/soak modes, and stopped describing a delivery-log read as a provider delivery test.
- Updated Axios and pinned the frontend runtime requirement to Node 24.

## Still requires deployment work

Repository code cannot provision high availability by itself. Before approving 1,000 tenants, provision managed PostgreSQL with failover, automated backups and PITR; managed Redis; private metrics/tracing; alert delivery; and production-equivalent staging. Run the included PostgreSQL tests and the k6 load, spike, and 8–24 hour soak gates there.

The generic email/SMS/push paths still use direct provider calls rather than a universal transactional outbox. The meeting-provider path is now durable, and scheduler batches are bounded, but a general notification outbox remains the recommended next reliability phase.

## Migration warning

`V9` changes numeric column types and can take table locks. Apply it first to a restored production copy, inspect the legacy waitlist safety check, and schedule the production migration in a controlled maintenance window. Never bypass the non-empty legacy-table failure by deleting data.
