#!/usr/bin/env bash
set -euo pipefail

: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL to an EMPTY non-production PostgreSQL URL}"
: "${RESTORE_DATABASE_USERNAME:?Set RESTORE_DATABASE_USERNAME}"
: "${RESTORE_DATABASE_PASSWORD:?Set RESTORE_DATABASE_PASSWORD}"

backup="${1:?Usage: postgres-restore-drill.sh <backup.dump>}"
url="${RESTORE_DATABASE_URL#jdbc:}"

PGPASSWORD="$RESTORE_DATABASE_PASSWORD" pg_restore \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  --exit-on-error \
  --username="$RESTORE_DATABASE_USERNAME" \
  --dbname="$url" \
  "$backup"

printf 'Restore completed. Start the backend against this database with Flyway enabled and ddl-auto=validate.\n'
