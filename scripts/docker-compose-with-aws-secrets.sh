#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  scripts/docker-compose-with-aws-secrets.sh <staging|production> [docker compose args...]

Examples:
  scripts/docker-compose-with-aws-secrets.sh staging up -d --build
  scripts/docker-compose-with-aws-secrets.sh production up -d --build
  scripts/docker-compose-with-aws-secrets.sh production pull

The script reads POSTGRES_PASSWORD from the AWS Secrets Manager JSON used by the selected
environment and exports it only for the docker compose process. Docker Compose itself cannot
read AWS Secrets Manager directly, but the Postgres container needs POSTGRES_PASSWORD during
startup, before the Spring backend can load the same secret.

Required secret key:
  POSTGRES_PASSWORD

Fallback supported for shared secret JSONs:
  SPRING_DATASOURCE_PASSWORD is used when POSTGRES_PASSWORD is absent.
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

ENVIRONMENT="$1"
shift || true

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

case "$ENVIRONMENT" in
  staging)
    COMPOSE_FILE="$ROOT_DIR/docker-compose.staging.yml"
    DEFAULT_ENV_FILE="$ROOT_DIR/.env.staging"
    DEFAULT_SECRET_ID="calendra-staging"
    SECRET_ENV_VAR="AWS_STAGING_SECRET_ID"
    DEFAULT_POSTGRES_DB="calendra_staging"
    DEFAULT_POSTGRES_USER="calendra"
    ;;
  production|prod)
    COMPOSE_FILE="$ROOT_DIR/docker-compose.prod.yml"
    DEFAULT_ENV_FILE="$ROOT_DIR/.env"
    DEFAULT_SECRET_ID="calendra-app"
    SECRET_ENV_VAR="AWS_PRODUCTION_SECRET_ID"
    DEFAULT_POSTGRES_DB="calendradb"
    DEFAULT_POSTGRES_USER="calendra"
    ;;
  -h|--help|help)
    usage
    exit 0
    ;;
  *)
    echo "Unsupported environment: $ENVIRONMENT" >&2
    usage
    exit 2
    ;;
esac

if ! command -v aws >/dev/null 2>&1; then
  echo "aws CLI is required to load POSTGRES_PASSWORD from AWS Secrets Manager." >&2
  exit 127
fi

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 is required to parse the AWS Secrets Manager JSON." >&2
  exit 127
fi

ENV_FILE="${CALENDRA_ENV_FILE:-$DEFAULT_ENV_FILE}"
load_env_for_aws_bootstrap() {
  local file="$1"
  [[ -f "$file" ]] || return 0
  local line key value
  while IFS= read -r line || [[ -n "$line" ]]; do
    line="${line%$'\r'}"
    [[ -z "$line" || "$line" =~ ^[[:space:]]*# ]] && continue
    [[ "$line" == *=* ]] || continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key//[[:space:]]/}"
    case "$key" in
      AWS_REGION|AWS_DEFAULT_REGION|AWS_PROFILE|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_STAGING_SECRET_ID|AWS_PRODUCTION_SECRET_ID|POSTGRES_USER|POSTGRES_DB)
        if [[ -z "${!key:-}" ]]; then
          value="${value%$'\r'}"
          value="${value#\"}"
          value="${value%\"}"
          value="${value#\'}"
          value="${value%\'}"
          export "$key=$value"
        fi
        ;;
    esac
  done < "$file"
}

load_env_for_aws_bootstrap "$ENV_FILE"

SECRET_ID="${!SECRET_ENV_VAR:-$DEFAULT_SECRET_ID}"
if [[ -z "$SECRET_ID" ]]; then
  echo "$SECRET_ENV_VAR is empty; set it to the AWS Secrets Manager name or ARN." >&2
  exit 2
fi

SECRET_JSON="$(aws secretsmanager get-secret-value \
  --secret-id "$SECRET_ID" \
  --query SecretString \
  --output text)"

read_secret_key() {
  local primary_key="$1"
  local fallback_key="${2:-}"
  SECRET_JSON_INPUT="$SECRET_JSON" PRIMARY_KEY="$primary_key" FALLBACK_KEY="$fallback_key" python3 - <<'PY'
import json
import os
import sys

data = json.loads(os.environ["SECRET_JSON_INPUT"] or "{}")
primary = os.environ["PRIMARY_KEY"]
fallback = os.environ.get("FALLBACK_KEY") or None
value = data.get(primary)
if (value is None or value == "") and fallback:
    value = data.get(fallback)
if value is None:
    value = ""
sys.stdout.write(str(value))
PY
}

POSTGRES_PASSWORD_FROM_SECRET="$(read_secret_key POSTGRES_PASSWORD SPRING_DATASOURCE_PASSWORD)"
if [[ -z "$POSTGRES_PASSWORD_FROM_SECRET" ]]; then
  echo "Secret '$SECRET_ID' must contain POSTGRES_PASSWORD or SPRING_DATASOURCE_PASSWORD." >&2
  exit 2
fi

POSTGRES_USER_FROM_SECRET="$(read_secret_key POSTGRES_USER SPRING_DATASOURCE_USERNAME)"
POSTGRES_DB_FROM_SECRET="$(read_secret_key POSTGRES_DB)"

export POSTGRES_PASSWORD="$POSTGRES_PASSWORD_FROM_SECRET"
export POSTGRES_USER="${POSTGRES_USER_FROM_SECRET:-${POSTGRES_USER:-$DEFAULT_POSTGRES_USER}}"
export POSTGRES_DB="${POSTGRES_DB_FROM_SECRET:-${POSTGRES_DB:-$DEFAULT_POSTGRES_DB}}"

if [[ $# -eq 0 ]]; then
  set -- up -d --build
fi

COMPOSE_ENV_ARGS=()
if [[ -f "$ENV_FILE" ]]; then
  COMPOSE_ENV_ARGS+=(--env-file "$ENV_FILE")
fi

exec docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" "$@"
