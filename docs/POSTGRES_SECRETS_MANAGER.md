# PostgreSQL password in AWS Secrets Manager

Production and staging no longer store `POSTGRES_PASSWORD` in Docker Compose or `.env` files.

Docker Compose cannot read AWS Secrets Manager directly. The helper script reads the same AWS Secrets Manager JSON used by Spring Boot, exports `POSTGRES_PASSWORD` only for the `docker compose` process, and then starts the requested environment.

## Required secret values

For staging, the secret referenced by `AWS_STAGING_SECRET_ID` should contain at least:

```json
{
  "POSTGRES_PASSWORD": "replace-with-random-staging-db-password",
  "SPRING_DATASOURCE_URL": "jdbc:postgresql://db:5432/calendra_staging",
  "SPRING_DATASOURCE_USERNAME": "calendra",
  "SPRING_DATASOURCE_PASSWORD": "replace-with-the-same-db-password"
}
```

For production, the secret referenced by `AWS_PRODUCTION_SECRET_ID` should contain at least:

```json
{
  "POSTGRES_PASSWORD": "replace-with-random-production-db-password",
  "SPRING_DATASOURCE_URL": "jdbc:postgresql://db:5432/calendradb",
  "SPRING_DATASOURCE_USERNAME": "calendra",
  "SPRING_DATASOURCE_PASSWORD": "replace-with-the-same-db-password"
}
```

`POSTGRES_PASSWORD` is consumed by the Postgres container. `SPRING_DATASOURCE_PASSWORD` is consumed by the Spring backend. Keep them equal when the backend connects to the compose-managed Postgres service. If `POSTGRES_PASSWORD` is absent, the helper falls back to `SPRING_DATASOURCE_PASSWORD`.

## Start staging

```bash
cp .env.staging.example .env.staging
# edit AWS_STAGING_SECRET_ID / AWS_REGION as needed; do not add POSTGRES_PASSWORD
scripts/docker-compose-with-aws-secrets.sh staging up -d --build
```

## Start production

```bash
cp .env.example .env
# edit AWS_PRODUCTION_SECRET_ID / AWS_REGION as needed; do not add POSTGRES_PASSWORD
scripts/docker-compose-with-aws-secrets.sh production up -d --build
```

The host, VM, or CI runner must have AWS credentials or an IAM role that can call `secretsmanager:GetSecretValue` for the selected secret.
