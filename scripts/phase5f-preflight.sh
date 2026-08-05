#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SKIP_INSTALL="${SKIP_INSTALL:-false}"
RUN_DB_AUDIT="${RUN_DB_AUDIT:-auto}"

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "Required command not found: $1" >&2
    exit 1
  fi
}

require_command java
require_command node
require_command npm

java_major="$(java -version 2>&1 | awk -F'[\".]' '/version/ {print $2; exit}')"
node_major="$(node -p 'process.versions.node.split(".")[0]')"
if [[ -z "$java_major" || "$java_major" -lt 21 ]]; then
  echo "Java 21 or newer is required; found ${java_major:-unknown}." >&2
  exit 1
fi
if [[ -z "$node_major" || "$node_major" -lt 24 ]]; then
  echo "Node.js 24 or newer is required; found $(node --version)." >&2
  exit 1
fi

echo "== Backend verify =="
cd "$ROOT_DIR/backend"
chmod +x ./mvnw
./mvnw --batch-mode --no-transfer-progress verify

echo "== Frontend quality and production build =="
cd "$ROOT_DIR/frontend"
if [[ "$SKIP_INSTALL" != "true" ]]; then
  npm ci --no-audit --no-fund
fi
npm run typecheck
npm run lint
npm run build:production
npm run check:bundle

if [[ "$RUN_DB_AUDIT" == "true" || ( "$RUN_DB_AUDIT" == "auto" && -n "${DATABASE_URL:-}" ) ]]; then
  require_command psql
  if [[ -z "${DATABASE_URL:-}" ]]; then
    echo "DATABASE_URL must be set when RUN_DB_AUDIT=true." >&2
    exit 1
  fi
  echo "== Workspace integrity audit =="
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$ROOT_DIR/scripts/workspace-integrity-audit.sql"
fi

echo "Phase 5F preflight passed."
