# Production deployment from GitHub Container Registry

Production images are built by GitHub Actions. EC2 application nodes pull them rather than running Maven, npm, or Docker builds locally.

For the AWS ALB two-node topology, use `docker-compose.prod-alb.yml` through the `production-alb` deployment mode on **both** EC2 nodes. See `docs/operations/PRODUCTION_ALB_TWO_NODE.md`.

## One-time GHCR login on each EC2 node

For private images, create a GitHub personal access token with `read:packages`, then run:

```bash
read -s GHCR_TOKEN
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
unset GHCR_TOKEN
```

Use `sudo docker login` instead when Docker commands are normally run with `sudo`.

## Deploy the exact Git commit behind the ALB

Copy the full commit SHA from the successful GitHub Actions run and run the same deployment on EC2 node A and EC2 node B:

```bash
cd /path/to/calendra.si
export CALENDRA_IMAGE_TAG=FULL_GITHUB_COMMIT_SHA
scripts/docker-compose-with-aws-secrets.sh production-alb deploy
unset CALENDRA_IMAGE_TAG
```

The deploy command performs:

1. `docker compose pull backend frontend`
2. `docker compose up -d --no-build --wait`

No Maven, npm, Vite, or Docker image build runs on EC2.

The production secret must contain the shared managed PostgreSQL and Redis connection values described in `docs/operations/PRODUCTION_ALB_TWO_NODE.md`.

## Use the default tag from `.env`

Set this in the production `.env` file on both nodes:

```dotenv
CALENDRA_IMAGE_REGISTRY=ghcr.io/hospitalitysolutions
CALENDRA_IMAGE_TAG=FULL_GITHUB_COMMIT_SHA
```

Then deploy with:

```bash
scripts/docker-compose-with-aws-secrets.sh production-alb deploy
```

Using a full commit SHA is recommended. `latest` is supported but makes rollback and auditing less precise.

## Roll back

Set `CALENDRA_IMAGE_TAG` to the previous successful commit SHA on each node and run the same `production-alb deploy` command. Roll one target at a time so the other healthy target remains available through the ALB.

## Verify each ALB application node

```bash
docker compose -f docker-compose.prod-alb.yml ps
docker compose -f docker-compose.prod-alb.yml logs --tail=150 backend
curl -fsS http://localhost/api/actuator/health/readiness
```

The host-level readiness request reaches Caddy on port 80, which proxies the health endpoint to the local backend. The ALB uses the same path.

## Legacy single-node production

The older single-host topology remains available with:

```bash
scripts/docker-compose-with-aws-secrets.sh production deploy
```

It is retained for migration/fallback purposes; it is not the preferred topology for two EC2 targets behind an ALB.
