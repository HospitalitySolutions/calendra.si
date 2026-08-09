# Production baseline for 1,000 tenants

For AWS multi-node production, use `docker-compose.prod-alb.yml` on each EC2 application node behind an Application Load Balancer. Each EC2 node runs one backend/frontend/Caddy stack and both nodes share managed PostgreSQL and Redis. See `docs/operations/PRODUCTION_ALB_TWO_NODE.md`.

`docker-compose.prod-ha.yml` remains available for the older topology that runs two backend replicas behind Caddy on a single host; it does not provide EC2-host or Availability-Zone redundancy.

## Required managed PostgreSQL settings

- Automated backups and point-in-time recovery enabled.
- Multi-AZ/standby failover enabled when the availability target requires database failover.
- TLS required.
- Connection budget sized for every backend replica. The repository default is 20 Hikari connections per replica; keep total application pools below roughly 60–70% of the database connection limit.
- Slow-query, CPU, storage, IOPS, connection, replication-lag, and lock-wait alerts enabled.
- A tested restore at least quarterly and before large migrations.

## Required managed Redis settings

- Shared by every application node.
- Persistence/replication appropriate for the provider.
- TLS and authentication enabled when supported/required by the selected service.
- Memory and eviction alerts enabled. Do not use an eviction policy that silently discards rate-limit or realtime keys without accepting that degradation.

## Deployment gate

1. Back up the database and confirm the latest restore drill.
2. Run Flyway against a restored staging copy first.
3. Run backend tests, including the PostgreSQL Testcontainers tests.
4. Deploy EC2 node A and wait for `/api/actuator/health/readiness` to report `UP` through Caddy.
5. Deploy EC2 node B with the same immutable image tag and wait for readiness.
6. Register both nodes in the ALB target group and confirm both are healthy.
7. Test failover by removing one target and proving traffic continues through the other.
8. Run the corrected k6 quick test and inspect p95/p99, errors, DB connections, lock waits, Redis latency, and JVM memory.
9. Keep the previous image tag available for rollback. Database migrations are forward-only; do not run `flyway clean` in production.

## Restore drill

A restore is successful only when:

- the restored database passes Flyway validation;
- the application starts with `ddl-auto=validate`;
- representative login, booking, billing, waitlist, and guest-app flows work;
- row counts and latest invoice/booking records are verified;
- the measured restore time is within the chosen RTO and the recovered point is within the chosen RPO.

The helper scripts in `scripts/postgres-logical-backup.sh` and `scripts/postgres-restore-drill.sh` provide an additional logical backup/restore check. They complement, but do not replace, managed snapshots and PITR.
