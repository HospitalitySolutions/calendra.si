#!/usr/bin/env bash
set -euo pipefail

: "${SPRING_DATASOURCE_URL:?Set SPRING_DATASOURCE_URL, e.g. jdbc:postgresql://host:5432/db}"
: "${SPRING_DATASOURCE_USERNAME:?Set SPRING_DATASOURCE_USERNAME}"
: "${SPRING_DATASOURCE_PASSWORD:?Set SPRING_DATASOURCE_PASSWORD}"

output="${1:-calendra-$(date -u +%Y%m%dT%H%M%SZ).dump}"
url="${SPRING_DATASOURCE_URL#jdbc:}"

PGPASSWORD="$SPRING_DATASOURCE_PASSWORD" pg_dump \
  --format=custom \
  --no-owner \
  --no-privileges \
  --username="$SPRING_DATASOURCE_USERNAME" \
  --dbname="$url" \
  --file="$output"

printf 'Created logical backup: %s\n' "$output"
