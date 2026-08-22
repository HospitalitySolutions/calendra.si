#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE' >&2
Usage:
  scripts/docker-compose-with-aws-secrets.sh <staging|production|production-alb> [docker compose args...]
  scripts/docker-compose-with-aws-secrets.sh production-alb deploy

Production ALB (one application node per EC2) example:
  CALENDRA_IMAGE_TAG=<full-git-sha> scripts/docker-compose-with-aws-secrets.sh production-alb deploy

  # Run the same command on both EC2 app nodes. Both nodes use the same RDS,
  # Redis, image tag, and AWS Secrets Manager secret.

Single-node production (RDS PostgreSQL + local Docker Redis) example:
  CALENDRA_IMAGE_TAG=<full-git-sha> scripts/docker-compose-with-aws-secrets.sh production deploy

Staging example:
  CALENDRA_IMAGE_TAG=<full-git-sha> scripts/docker-compose-with-aws-secrets.sh staging deploy

Calling the script with only an environment defaults to the safe immutable-image deploy action.
It pulls backend/frontend and customer-web where defined from GHCR and starts Compose with --no-build.

Secrets Manager requirements:

  staging (local Postgres topology):
    POSTGRES_PASSWORD
    or SPRING_DATASOURCE_PASSWORD as a fallback.

  production (RDS PostgreSQL + local Docker Redis):
    SPRING_DATASOURCE_URL
    SPRING_DATASOURCE_USERNAME
    SPRING_DATASOURCE_PASSWORD

  production-alb (shared RDS PostgreSQL + managed Redis):
    SPRING_DATASOURCE_URL
    SPRING_DATASOURCE_USERNAME
    SPRING_DATASOURCE_PASSWORD
    SPRING_DATA_REDIS_HOST

  Optional production-alb Redis keys:
    SPRING_DATA_REDIS_PORT             (default 6379)
    SPRING_DATA_REDIS_USERNAME
    SPRING_DATA_REDIS_PASSWORD
    SPRING_DATA_REDIS_SSL_ENABLED      (default false; enable for TLS Redis)

The managed-service values are exported only to the Docker Compose process. The Spring
backend still imports the same production secret at runtime for the rest of its credentials.
USAGE
}

if [[ $# -lt 1 ]]; then
  usage
  exit 2
fi

ENVIRONMENT="$1"
shift || true

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MANAGED_POSTGRES=false
MANAGED_REDIS=false

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
    MANAGED_POSTGRES=true
    ;;
  production-alb|prod-alb)
    COMPOSE_FILE="$ROOT_DIR/docker-compose.prod-alb.yml"
    DEFAULT_ENV_FILE="$ROOT_DIR/.env"
    DEFAULT_SECRET_ID="calendra-app"
    SECRET_ENV_VAR="AWS_PRODUCTION_SECRET_ID"
    DEFAULT_POSTGRES_DB="calendradb"
    DEFAULT_POSTGRES_USER="calendra"
    MANAGED_POSTGRES=true
    MANAGED_REDIS=true
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
  echo "aws CLI is required to load deployment values from AWS Secrets Manager." >&2
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
      AWS_REGION|AWS_DEFAULT_REGION|AWS_PROFILE|AWS_ACCESS_KEY_ID|AWS_SECRET_ACCESS_KEY|AWS_SESSION_TOKEN|AWS_STAGING_SECRET_ID|AWS_PRODUCTION_SECRET_ID|POSTGRES_USER|POSTGRES_DB|CALENDRA_IMAGE_REGISTRY|CALENDRA_IMAGE_TAG|CALENDRA_PUBLIC_SITE_UPSTREAM|BACKEND_MEMORY_LIMIT|BACKEND_CPU_LIMIT|FRONTEND_MEMORY_LIMIT|FRONTEND_CPU_LIMIT)
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

secret_or_env() {
  local key="$1"
  local fallback_key="${2:-}"
  local current="${!key:-}"
  if [[ -n "$current" ]]; then
    printf '%s' "$current"
    return 0
  fi
  read_secret_key "$key" "$fallback_key"
}

require_value() {
  local key="$1"
  local value="$2"
  if [[ -z "$value" ]]; then
    echo "Secret '$SECRET_ID' (or the process environment) must provide $key." >&2
    exit 2
  fi
}

if [[ "$MANAGED_POSTGRES" == true ]]; then
  SPRING_DATASOURCE_URL_VALUE="$(secret_or_env SPRING_DATASOURCE_URL)"
  SPRING_DATASOURCE_USERNAME_VALUE="$(secret_or_env SPRING_DATASOURCE_USERNAME POSTGRES_USER)"
  SPRING_DATASOURCE_PASSWORD_VALUE="$(secret_or_env SPRING_DATASOURCE_PASSWORD POSTGRES_PASSWORD)"

  require_value SPRING_DATASOURCE_URL "$SPRING_DATASOURCE_URL_VALUE"
  require_value SPRING_DATASOURCE_USERNAME "$SPRING_DATASOURCE_USERNAME_VALUE"
  require_value SPRING_DATASOURCE_PASSWORD "$SPRING_DATASOURCE_PASSWORD_VALUE"

  export SPRING_DATASOURCE_URL="$SPRING_DATASOURCE_URL_VALUE"
  export SPRING_DATASOURCE_USERNAME="$SPRING_DATASOURCE_USERNAME_VALUE"
  export SPRING_DATASOURCE_PASSWORD="$SPRING_DATASOURCE_PASSWORD_VALUE"
else
  POSTGRES_PASSWORD_FROM_SECRET="$(secret_or_env POSTGRES_PASSWORD SPRING_DATASOURCE_PASSWORD)"
  if [[ -z "$POSTGRES_PASSWORD_FROM_SECRET" ]]; then
    echo "Secret '$SECRET_ID' must contain POSTGRES_PASSWORD or SPRING_DATASOURCE_PASSWORD." >&2
    exit 2
  fi

  POSTGRES_USER_FROM_SECRET="$(read_secret_key POSTGRES_USER SPRING_DATASOURCE_USERNAME)"
  POSTGRES_DB_FROM_SECRET="$(read_secret_key POSTGRES_DB)"

  export POSTGRES_PASSWORD="$POSTGRES_PASSWORD_FROM_SECRET"
  export POSTGRES_USER="${POSTGRES_USER_FROM_SECRET:-${POSTGRES_USER:-$DEFAULT_POSTGRES_USER}}"
  export POSTGRES_DB="${POSTGRES_DB_FROM_SECRET:-${POSTGRES_DB:-$DEFAULT_POSTGRES_DB}}"
fi

if [[ "$MANAGED_REDIS" == true ]]; then
  SPRING_DATA_REDIS_HOST_VALUE="$(secret_or_env SPRING_DATA_REDIS_HOST)"
  SPRING_DATA_REDIS_PORT_VALUE="$(secret_or_env SPRING_DATA_REDIS_PORT)"
  SPRING_DATA_REDIS_USERNAME_VALUE="$(secret_or_env SPRING_DATA_REDIS_USERNAME)"
  SPRING_DATA_REDIS_PASSWORD_VALUE="$(secret_or_env SPRING_DATA_REDIS_PASSWORD)"
  SPRING_DATA_REDIS_SSL_ENABLED_VALUE="$(secret_or_env SPRING_DATA_REDIS_SSL_ENABLED)"

  require_value SPRING_DATA_REDIS_HOST "$SPRING_DATA_REDIS_HOST_VALUE"

  export SPRING_DATA_REDIS_HOST="$SPRING_DATA_REDIS_HOST_VALUE"
  export SPRING_DATA_REDIS_PORT="${SPRING_DATA_REDIS_PORT_VALUE:-6379}"
  export SPRING_DATA_REDIS_USERNAME="$SPRING_DATA_REDIS_USERNAME_VALUE"
  export SPRING_DATA_REDIS_PASSWORD="$SPRING_DATA_REDIS_PASSWORD_VALUE"
  export SPRING_DATA_REDIS_SSL_ENABLED="${SPRING_DATA_REDIS_SSL_ENABLED_VALUE:-false}"
fi

COMPOSE_ENV_ARGS=()
if [[ -f "$ENV_FILE" ]]; then
  COMPOSE_ENV_ARGS+=(--env-file "$ENV_FILE")
fi

compose() {
  docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" "$@"
}

# Staging and production deploy immutable CI-built images by default.
if [[ $# -eq 0 ]]; then
  set -- deploy
fi

if [[ "${1:-}" == "deploy" ]]; then
  shift
  if [[ $# -ne 0 ]]; then
    echo "The deploy shortcut does not accept additional arguments." >&2
    exit 2
  fi

  if [[ "$ENVIRONMENT" == "staging" && ! "${CALENDRA_IMAGE_TAG:-}" =~ ^[0-9a-fA-F]{40}$ ]]; then
    echo "Staging requires CALENDRA_IMAGE_TAG to be the full 40-character Git SHA published by GitHub Actions." >&2
    exit 2
  fi

  COMPOSE_SERVICES="$(compose config --services)"

  # Any production topology serving calendra.si/racun requires customer-web.
  # Fail early if an outdated Compose file would otherwise deploy successfully
  # without the customer account container.
  if [[ "$ENVIRONMENT" == "production" || "$ENVIRONMENT" == "prod" || "$ENVIRONMENT" == "production-alb" || "$ENVIRONMENT" == "prod-alb" ]]; then
    for required_service in backend frontend customer-web proxy; do
      if ! grep -qx "$required_service" <<<"$COMPOSE_SERVICES"; then
        echo "Production deploy requires Compose service '$required_service', but it is missing from $COMPOSE_FILE." >&2
        exit 2
      fi
    done
  fi

  echo "Pulling Calendra images tagged '${CALENDRA_IMAGE_TAG:-latest}' from '${CALENDRA_IMAGE_REGISTRY:-ghcr.io/hospitalitysolutions}'..."
  PULL_SERVICES=(backend frontend)
  if grep -qx 'customer-web' <<<"$COMPOSE_SERVICES"; then
    PULL_SERVICES+=(customer-web)
  fi
  compose pull "${PULL_SERVICES[@]}"

  # Validate the Caddyfile through a one-shot Compose container BEFORE touching
  # the live proxy. This mounts the current file from the host, unlike `exec`
  # against an older proxy container whose bind mount may still reference the
  # previous file inode after a git checkout/pull replaced the Caddyfile.
  if grep -qx 'proxy' <<<"$COMPOSE_SERVICES"; then
    echo "Validating current Caddy proxy configuration..."
    compose run --rm --no-deps proxy caddy validate \
      --config /etc/caddy/Caddyfile \
      --adapter caddyfile
  fi

  echo "Starting ${ENVIRONMENT} without a local image build..."
  compose up -d --no-build --wait --remove-orphans

  # The proxy Caddyfile is bind-mounted as a single file. If git replaces that
  # file, a long-running container can remain attached to the old inode. A Caddy
  # hot reload from inside that container would then reload the stale file again.
  # Recreate the proxy on every deploy so Docker re-attaches the bind mount to the
  # current host Caddyfile. The new Caddy process loads that validated config on
  # startup, so a separate `caddy reload` is intentionally unnecessary.
  if grep -qx 'proxy' <<<"$COMPOSE_SERVICES"; then
    echo "Recreating Caddy proxy to refresh bind-mounted configuration..."
    compose up -d --no-build --no-deps --force-recreate proxy

    echo "Verifying Caddy proxy configuration after recreation..."
    compose exec -T proxy caddy validate \
      --config /etc/caddy/Caddyfile \
      --adapter caddyfile
  fi

  echo "${ENVIRONMENT} deployment completed successfully."
  exit 0
fi

exec docker compose "${COMPOSE_ENV_ARGS[@]}" -f "$COMPOSE_FILE" "$@"
