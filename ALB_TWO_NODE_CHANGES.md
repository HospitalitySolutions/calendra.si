# ALB two-node production changes

Implemented for the AWS Application Load Balancer + two EC2 application-node topology:

- Added `Caddyfile.production.alb`: HTTP-only Caddy behind ALB TLS termination, with a host-independent `/api/actuator/health/readiness` route.
- Added `docker-compose.prod-alb.yml`: one backend/frontend/Caddy stack per EC2, using shared external RDS PostgreSQL and Redis.
- Extended `scripts/docker-compose-with-aws-secrets.sh` with `production-alb` mode and managed PostgreSQL/Redis secret loading.
- Added optional managed-Redis username and TLS configuration to the production Spring profile.
- Added ShedLock protection to `DemoBookingReminderScheduler` for safe multi-node scheduling.
- Added `scripts/configure-production-alb-target-group.sh` to apply readiness health checks and 1-hour ALB cookie stickiness for the current node-local Google OAuth/signup session state.
- Updated CI Compose validation and production deployment/operations documentation.

Validation performed in this workspace:

- `bash -n` passed for both modified/new shell scripts.
- YAML parsing passed for `docker-compose.prod-alb.yml` and `application-production.yml`.
- The production-alb secret-loader path was exercised with mocked AWS/Docker commands and correctly propagated RDS/Redis values.
- The legacy production secret-loader path was also exercised with mocks and remains functional.
- Backend Maven compile could not be executed because this environment has no Maven installation and Maven Wrapper dependency download is unavailable from the network.

Before switching real traffic:

1. Create/configure managed Redis and add its connection values to `calendra-app` Secrets Manager.
2. Deploy `production-alb` to both EC2 nodes with the same immutable image tag.
3. Ensure each node's port 80 is reachable only from the ALB security group.
4. Register both targets and verify `/api/actuator/health/readiness` is healthy.
5. Apply target-group stickiness (or run the included helper script).
6. Verify the marketing-site upstream is reachable from both EC2 nodes.
7. Test OAuth, booking, realtime/SSE, billing and failover before changing production DNS.
