# Production deployment from GitHub Container Registry

Production images are built by GitHub Actions. The EC2 instance must pull them rather than run Maven, npm, or Docker builds locally.

## One-time GHCR login on EC2

For private images, create a GitHub personal access token with `read:packages`, then run:

```bash
read -s GHCR_TOKEN
echo "$GHCR_TOKEN" | docker login ghcr.io -u YOUR_GITHUB_USERNAME --password-stdin
unset GHCR_TOKEN
```

Use `sudo docker login` instead when Docker commands are normally run with `sudo`.

## Deploy the exact Git commit

Copy the full commit SHA from the successful GitHub Actions run:

```bash
cd /path/to/calendra.si
export CALENDRA_IMAGE_TAG=FULL_GITHUB_COMMIT_SHA
scripts/docker-compose-with-aws-secrets.sh production deploy
unset CALENDRA_IMAGE_TAG
```

The deploy command performs:

1. `docker compose pull backend frontend`
2. `docker compose up -d --no-build --wait`

No Maven, npm, Vite, or Docker image build runs on EC2.

## Use the default tag from `.env`

Set this in the production `.env` file:

```dotenv
CALENDRA_IMAGE_REGISTRY=ghcr.io/hospitalitysolutions
CALENDRA_IMAGE_TAG=FULL_GITHUB_COMMIT_SHA
```

Then deploy with:

```bash
scripts/docker-compose-with-aws-secrets.sh production deploy
```

Using a full commit SHA is recommended. `latest` is supported but makes rollback and auditing less precise.

## Roll back

Set `CALENDRA_IMAGE_TAG` to the previous successful commit SHA and run the same deploy command.

## Verify

```bash
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail=150 backend
curl -fsS http://localhost:4000/api/actuator/health/readiness
```
