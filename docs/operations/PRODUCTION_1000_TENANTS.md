# Production baseline for 1,000 tenants

Use `docker-compose.prod-ha.yml`, not the single-node compose file, for the production topology. It runs two stateless backend instances behind Caddy and expects managed PostgreSQL and Redis endpoints.

## Required managed PostgreSQL settings

- Automated backups and point-in-time recovery enabled.
- Multi-AZ/standby failover enabled.
- TLS required.
- Connection budget sized for every backend replica. The repository default is 20 Hikari connections per replica; keep total application pools below roughly 60–70% of the database connection limit.
- Slow-query, CPU, storage, IOPS, connection, replication-lag, and lock-wait alerts enabled.
- A tested restore at least quarterly and before large migrations.

## Required managed Redis settings

- Persistence/replication appropriate for the provider.
- TLS and authentication enabled.
- Memory and eviction alerts enabled. Do not use an eviction policy that silently discards rate-limit or realtime keys without accepting that degradation.

## Deployment gate

1. Back up the database and confirm the latest restore drill.
2. Run Flyway against a restored staging copy first.
3. Run backend tests, including the PostgreSQL Testcontainers tests.
4. Deploy one backend instance and wait for `/api/actuator/health/readiness` to report `UP`.
5. Deploy the second instance, then restart the first to prove traffic failover.
6. Run the corrected k6 quick test and inspect p95/p99, errors, DB connections, lock waits, Redis latency, and JVM memory.
7. Keep the previous image tag available for rollback. Database migrations are forward-only; do not run `flyway clean` in production.

## Restore drill

A restore is successful only when:

- the restored database passes Flyway validation;
- the application starts with `ddl-auto=validate`;
- representative login, booking, billing, waitlist, and guest-app flows work;
- row counts and latest invoice/booking records are verified;
- the measured restore time is within the chosen RTO and the recovered point is within the chosen RPO.

The helper scripts in `scripts/postgres-logical-backup.sh` and `scripts/postgres-restore-drill.sh` provide an additional logical backup/restore check. They complement, but do not replace, managed snapshots and PITR.
