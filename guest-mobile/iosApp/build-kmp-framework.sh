#!/bin/sh
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

"${PROJECT_ROOT}/gradlew" :shared:assemble

echo "KMP shared framework build completed."
