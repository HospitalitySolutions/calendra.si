#!/bin/sh
set -eu

if [ "${CONFIGURATION:-}" != "Release" ]; then
  exit 0
fi

value="${API_BASE_URL:-}"

if [ -z "$value" ] || printf '%s' "$value" | grep -q '\$('; then
  echo "error: API_BASE_URL must be set for iOS Release builds, for example: API_BASE_URL=https://app.calendra.si"
  exit 1
fi

case "$value" in
  https://*) ;;
  *)
    echo "error: API_BASE_URL must use https:// for iOS Release builds. Current value: $value"
    exit 1
    ;;
esac

case "$value" in
  *localhost*|*127.0.0.1*|*10.0.2.2*)
    echo "error: API_BASE_URL must not point to a local development host for iOS Release builds. Current value: $value"
    exit 1
    ;;
esac
