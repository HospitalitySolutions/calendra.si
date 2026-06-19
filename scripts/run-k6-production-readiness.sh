#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-load-tests/env/staging.env}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

: "${BASE_URL:?Set BASE_URL in env or $ENV_FILE}"
: "${ORIGIN:?Set ORIGIN in env or $ENV_FILE}"

k6 run \
  -e BASE_URL="$BASE_URL" \
  -e ORIGIN="$ORIGIN" \
  -e LOADTEST_PASSWORD="${LOADTEST_PASSWORD:-LoadTest123!}" \
  -e SEED_TENANTS="${SEED_TENANTS:-1000}" \
  -e SEED_GUESTS="${SEED_GUESTS:-10000}" \
  -e P95_MS="${P95_MS:-800}" \
  -e ERROR_RATE="${ERROR_RATE:-0.01}" \
  -e QUICK="${QUICK:-false}" \
  load-tests/k6/production-readiness.js
