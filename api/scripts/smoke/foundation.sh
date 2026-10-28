#!/usr/bin/env bash
# Smoke check for Block 0 against a running server: health, unknown route, request id.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"

show() {
  local label="$1" path="$2"
  echo "== ${label}: GET ${path}"
  curl -sS -i "${BASE_URL}${path}" | grep -iE '^(HTTP/|x-request-id:)|^\{'
  echo
}

curl -s --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null "${BASE_URL}/health" || true
show "health" "/health"
show "unknown route" "/no-such-route"
