# Calendra load tests

These are basic k6 smoke/load tests for the public widget.

## Run locally

```bash
k6 run \
  -e BASE_URL=http://localhost:4000 \
  -e TENANT_CODE=yourTenantCode \
  -e ORIGIN=http://localhost:3000 \
  -e VUS=20 \
  -e DURATION=2m \
  load-tests/k6/widget-smoke.js
```

## What this checks

- Public widget config can be loaded.
- Public widget service list can be loaded.
- Availability lookup responds quickly enough.
- Error rate stays below 2%.
- p95 response time stays below 750 ms.

Booking/order load tests should be added only with a dedicated staging tenant, disposable products/services, idempotency keys, and payment sandbox settings.
