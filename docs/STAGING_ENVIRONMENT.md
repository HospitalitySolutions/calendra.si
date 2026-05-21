# Staging environment

Staging is the rehearsal room: it should look like production, but use fake/sandbox data and separate credentials.

## Start staging locally or on a staging VM

```bash
cp .env.staging.example .env.staging
# edit .env.staging
docker compose --env-file .env.staging -f docker-compose.staging.yml up -d --build
```

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
