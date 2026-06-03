# Staging environment

Staging is the rehearsal room: it should look like production, but use fake/sandbox data and separate credentials.

## Start staging locally or on a staging VM

```bash
cp .env.staging.example .env.staging
# edit .env.staging, but do not put POSTGRES_PASSWORD there
# store POSTGRES_PASSWORD / SPRING_DATASOURCE_PASSWORD in AWS Secrets Manager
scripts/docker-compose-with-aws-secrets.sh staging up -d --build
```


## Database password source

Staging no longer keeps `POSTGRES_PASSWORD` in `.env.staging` or in `docker-compose.staging.yml`. Store it in the AWS Secrets Manager JSON used by the backend. The compose helper reads the same secret before starting Postgres and exports the password only for that compose process.

Recommended staging secret keys:

```json
{
  "POSTGRES_PASSWORD": "replace-with-random-staging-db-password",
  "SPRING_DATASOURCE_URL": "jdbc:postgresql://db:5432/calendra_staging",
  "SPRING_DATASOURCE_USERNAME": "calendra",
  "SPRING_DATASOURCE_PASSWORD": "replace-with-the-same-db-password",
  "APP_JWT_SECRET": "replace-with-at-least-32-characters-random-string"
}
```

`POSTGRES_PASSWORD` is used by the Postgres container. `SPRING_DATASOURCE_PASSWORD` is used by the Spring backend. They should be the same value when the backend connects to the compose Postgres service. If `POSTGRES_PASSWORD` is missing, the helper falls back to `SPRING_DATASOURCE_PASSWORD`.

## Useful checks

```bash
curl http://localhost:4000/actuator/health
curl http://localhost:4000/actuator/prometheus
```

If you use the proxy container, use the ports from `.env.staging`.

## Recommended staging settings

- Use a separate PostgreSQL database/volume.
- Use a separate Redis instance/volume.
- Use sandbox Stripe/PayPal/FURS/SMS credentials.
- Keep `APP_WIDGET_REQUIRE_ALLOWED_ORIGIN=false` until tenant domains are configured.
- Turn on `APP_WIDGET_TURNSTILE_REQUIRED_FOR_PUBLIC_ACTIONS=true` before public demo links.
- Set `APP_RATE_LIMIT_BACKEND=redis` once Redis is confirmed stable.
- Send OpenTelemetry traces to your staging collector by setting `MANAGEMENT_OTLP_TRACING_ENDPOINT`.

## Before production

Staging should pass:

- backend test suite
- frontend build
- Testcontainers integration tests
- widget k6 smoke test against a disposable tenant
- health endpoint check
- a manual payment sandbox flow
