# Calendra load tests

This directory contains k6 load tests and a staging-only data seeder for production-readiness checks.

The goal is to validate Calendra against the first production scale target:

- 1000 tenants
- 10,000 guests
- 50,000+ bookings
- 10,000+ orders
- 100,000+ delivery log rows
- large inbox/message history

The tests are intentionally HTTP-level API tests. They are not browser automation tests.

## Safety rules

Run these only against a disposable staging database or a staging database that you are willing to reset.

Never run the seeder or write-heavy k6 scenarios against production.

All seeded tenants use tenant codes like:

```text
lt-0001
lt-0002
...
```

All seeded users use emails ending with:

```text
@loadtest.local
```

Default password:

```text
LoadTest123!
```

## 1. Seed staging data

Start the backend once with the `loadtest-seed` profile and the seed properties enabled.

Example with Spring Boot locally/staging shell:

```bash
cd backend
./mvnw spring-boot:run \
  -Dspring-boot.run.profiles=staging,loadtest-seed \
  -Dspring-boot.run.arguments="--app.loadtest.seed.enabled=true --app.loadtest.seed.reset=true --app.loadtest.seed.tenants=1000 --app.loadtest.seed.guests=10000 --app.loadtest.seed.bookings=50000 --app.loadtest.seed.orders=10000 --app.loadtest.seed.delivery-logs=100000 --app.loadtest.seed.inbox-messages=50000"
```

For Docker staging, add the profile and environment variables only for a one-time seeding run:

```bash
SPRING_PROFILES_ACTIVE=staging,loadtest-seed
APP_LOADTEST_SEED_ENABLED=true
APP_LOADTEST_SEED_RESET=true
APP_LOADTEST_SEED_TENANTS=1000
APP_LOADTEST_SEED_GUESTS=10000
APP_LOADTEST_SEED_BOOKINGS=50000
APP_LOADTEST_SEED_ORDERS=10000
APP_LOADTEST_SEED_DELIVERY_LOGS=100000
APP_LOADTEST_SEED_INBOX_MESSAGES=50000
```

After the seed log says `Load-test seed complete`, restart the backend normally without the `loadtest-seed` profile.

## 2. Install k6

Use the official k6 package, standalone binary, or Docker image.

Windows example:

```powershell
winget install k6.k6
```

Docker example:

```bash
docker run --rm -i grafana/k6 version
```

## 3. Configure staging target

Copy and edit:

```bash
cp load-tests/env/staging.example.env load-tests/env/staging.env
```

Example:

```env
BASE_URL=https://staging.app.calendra.si
ORIGIN=https://staging.calendra.si
LOADTEST_PASSWORD=LoadTest123!
SEED_TENANTS=1000
SEED_GUESTS=10000
P95_MS=800
ERROR_RATE=0.01
QUICK=false
```

## 4. Run quick validation first

```bash
QUICK=true ./scripts/run-k6-production-readiness.sh load-tests/env/staging.env
```

Windows PowerShell:

```powershell
$env:QUICK="true"
./scripts/run-k6-production-readiness.ps1 load-tests/env/staging.env
```

## 5. Run the production-readiness load test

```bash
./scripts/run-k6-production-readiness.sh load-tests/env/staging.env
```

Windows PowerShell:

```powershell
./scripts/run-k6-production-readiness.ps1 load-tests/env/staging.env
```

The main test covers:

- guest login
- guest home/products/service listing
- availability lookup
- order creation
- booking creation through guest app flow
- booking reschedule
- booking cancellation
- guest wallet
- guest booking history
- guest notifications
- guest inbox listing
- public widget config/services/availability
- public widget booking creation
- web/admin calendar loading
- web/admin booking listing
- billing list pagination
- open-bill list pagination
- delivery-log list pagination and filtering
- admin inbox thread listing
- delivery-log read-path probe (real provider delivery is tested separately)

Current readiness thresholds:

```text
http_req_failed < 1%
http_req_duration p95 < 800 ms
checks > 99%
```

You may temporarily relax p95 to 1500 ms during investigation, but do not treat the app as production-ready until common endpoints are below the 500-800 ms target.

## 6. Optional payment sandbox smoke

This is intentionally a small smoke test, not a high-volume payment load test. Do not generate thousands of Stripe/PayPal checkout sessions.

Run only when staging Stripe/PayPal sandbox settings are configured:

```bash
k6 run \
  -e BASE_URL=https://staging.app.calendra.si \
  -e ORIGIN=https://staging.calendra.si \
  -e LOADTEST_PASSWORD=LoadTest123! \
  -e PAYMENT_GUEST_INDEX=1 \
  -e PAYMENT_TENANT_INDEX=1 \
  load-tests/k6/payment-sandbox-smoke.js
```

The smoke accepts either a successful checkout URL or a clear `STRIPE_SETUP_REQUIRED` response. That means the code path is safe to run before final live sandbox keys are configured.

## 7. What to watch during the test

Do not rely only on k6 output. Watch infrastructure at the same time:

- backend 5xx logs
- backend CPU/JVM memory/GC
- DB CPU, active connections, lock waits, slow queries
- Redis CPU/memory/errors
- Caddy/proxy 499/502/504 logs
- failed booking/order/notification counters
- delivery-log growth
- disk usage

Minimum pass criteria for first production readiness:

```text
p95 API response < 500-800 ms for common endpoints
error rate < 1%
no DB connection starvation
no Redis failure cascade
no calendar endpoint timeouts
no booking double-submit issue
```

## Existing widget smoke

The older smoke test is still available:

```bash
k6 run \
  -e BASE_URL=http://localhost:4000 \
  -e TENANT_CODE=lt-0001 \
  -e ORIGIN=http://localhost:3000 \
  -e VUS=20 \
  -e DURATION=2m \
  load-tests/k6/widget-smoke.js
```


## Test modes

Set `TEST_MODE=quick` for the CI smoke or `TEST_MODE=load` for the normal production-readiness run.
The `delivery_log_read_probe` scenario measures the delivery-log hot path only; it intentionally does not claim to validate real email/SMS/push provider throughput. Provider sandbox tests must be run separately with non-production recipients.

The setup check uses `/api/actuator/health/readiness` and fails unless it receives HTTP 200 with status `UP`.

### Spike and soak runs

Run a burst test after the normal load test passes:

```bash
TEST_MODE=spike ./scripts/run-k6-production-readiness.sh load-tests/env/staging.env
```

Run the final endurance gate for at least eight hours:

```bash
TEST_MODE=soak SOAK_DURATION=8h ./scripts/run-k6-production-readiness.sh load-tests/env/staging.env
```

Store the k6 summary together with database, Redis, JVM, proxy, and provider metrics. A repository containing a test definition is not evidence of capacity until these runs pass against production-equivalent infrastructure and data.
