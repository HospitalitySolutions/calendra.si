# Production ALB topology: two EC2 application nodes

This is the preferred production topology when Calendra runs behind an AWS Application Load Balancer (ALB).

```text
Internet
   |
   | HTTPS :443
   v
AWS Application Load Balancer
   |                       |
   | HTTP :80              | HTTP :80
   v                       v
EC2 app node A          EC2 app node B
Caddy + frontend        Caddy + frontend
+ backend               + backend
   \                       /
    \                     /
     +---- shared RDS ----+
     +--- shared Redis ---+
```

Use **one EC2 instance per Availability Zone** and run the same immutable image tag on both nodes.

## Compose file

Use `docker-compose.prod-alb.yml` on **each** EC2 node. Do not run the local `db` or `redis` containers on either application node.

Both nodes must use the same:

- `SPRING_DATASOURCE_URL`, username and password (RDS PostgreSQL);
- `SPRING_DATA_REDIS_HOST` and Redis credentials/TLS settings;
- `CALENDRA_IMAGE_TAG`;
- production AWS Secrets Manager secret.

Deployment command on each node:

```bash
CALENDRA_IMAGE_TAG=<full-git-sha> \
  ./scripts/docker-compose-with-aws-secrets.sh production-alb deploy
```

The deployment helper reads the managed PostgreSQL and Redis connection values from the production AWS Secrets Manager JSON and exports them only to Docker Compose.

## ALB listeners

Use two listeners:

- `HTTP :80` -> **301 redirect** to `HTTPS :443`;
- `HTTPS :443` -> **forward** to the production target group.

Terminate the public TLS certificate on the ALB. `Caddyfile.production.alb` intentionally listens on HTTP port 80 only.

## Target group

Recommended target-group settings:

- Target type: `Instances`
- Protocol: `HTTP`
- Port: `80`
- Protocol version: `HTTP1`
- Health check protocol: `HTTP`
- Health check path: `/api/actuator/health/readiness`
- Health check port: traffic port
- Success code: `200`
- Interval: `15s`
- Timeout: `5s`
- Healthy threshold: `2`
- Unhealthy threshold: `2`

The readiness route is host-independent in `Caddyfile.production.alb`, because ALB health checks send the target's private address in the Host header rather than a Calendra public hostname.

After the target group is created, the repository helper can apply the health settings and the temporary OAuth stickiness setting:

```bash
AWS_REGION=eu-central-1 \
  ./scripts/configure-production-alb-target-group.sh <target-group-arn>
```

## Temporary target stickiness

Enable ALB-generated cookie stickiness for **1 hour**.

Calendra's Google OAuth/signup flow still keeps short-lived authorization/signup state in the node-local `HttpSession`. Stickiness prevents the OAuth start request from landing on one EC2 node and the callback landing on the other.

This is intentionally a transitional safeguard. When HTTP sessions are moved to a shared session store, target stickiness can be reevaluated/removed.

## Security groups

Recommended flow:

```text
Internet -> ALB SG :80/:443
ALB SG   -> EC2 app SG :80
EC2 app SG -> RDS SG :5432
EC2 app SG -> Redis SG :Redis port
```

The EC2 application nodes should **not** expose port 80 to `0.0.0.0/0`. Allow port 80 from the ALB security group only. Keep SSH/SSM administration separate from application traffic.

## Caddy and forwarded HTTPS

The ALB terminates TLS, so Caddy receives HTTP inside the VPC. Caddy explicitly forwards `X-Forwarded-Proto: https` and `X-Forwarded-Port: 443` to the backend so Spring generates secure public redirects/callbacks.

The marketing-site upstream used by `calendra.si` must be reachable from **both** EC2 targets. Its default remains `host.docker.internal:8080`; override `CALENDRA_PUBLIC_SITE_UPSTREAM` when the marketing site is moved to a shared upstream.

## Shared Redis is required

Multi-node production is not only `ALB + 2 EC2 + RDS`. Both app nodes also need the same managed Redis endpoint because production uses Redis for distributed rate limiting and cross-node realtime booking events, and Redis is part of the readiness health group.

When the Redis service requires TLS, set `SPRING_DATA_REDIS_SSL_ENABLED=true`. Optional username/password values are supported by the production configuration.

## Scheduled jobs

Scheduled jobs that can run on both backend nodes must use ShedLock. `DemoBookingReminderScheduler` is protected by `demoBookingReminderScheduler_sendDueReminders`; existing protected jobs keep their current locks.

## Rollout sequence

1. Create/configure RDS and managed Redis and put connection values in the production Secrets Manager secret.
2. Prepare EC2 node A and deploy `production-alb`.
3. Confirm `curl http://localhost/api/actuator/health/readiness` reaches Caddy and returns `UP`.
4. Prepare EC2 node B with the same image tag and deploy it.
5. Register both EC2 instances in the ALB target group.
6. Wait until both targets are `Healthy`.
7. Verify HTTP -> HTTPS redirect and the HTTPS listener.
8. Test login, Google OAuth signup/login, public booking, modify/cancel links, SSE/realtime updates, billing, file/media flows, and scheduled notifications.
9. Only then point production DNS to the ALB.
10. Test failover by deregistering/stopping one node and confirming the application remains usable through the other.
