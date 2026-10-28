#!/usr/bin/env bash
# Shared helpers for the per-block smoke scripts. Source it; do not run it.
# Needs: a running server at BASE_URL, an owner account, SMOKE_PASSWORD in the environment.
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3000}"
SMOKE_USER="${SMOKE_USER:-owner}"
: "${SMOKE_PASSWORD:?set SMOKE_PASSWORD to the owner password}"

TOKEN=""
STATUS=""
BODY=""
FAILURES=0

wait_for_server() {
  curl -s --retry 15 --retry-connrefused --retry-delay 1 -o /dev/null "${BASE_URL}/health"
}

# call METHOD PATH [JSON_BODY] -> sets STATUS and BODY, prints one line per call
call() {
  local method="$1" path="$2" body="${3:-}"
  local args=(-sS -X "$method" -w '\n%{http_code}' -H "Idempotency-Key: smoke-$(uuidgen)")
  [[ -n "$TOKEN" ]] && args+=(-H "Authorization: Bearer ${TOKEN}")
  [[ -n "$body" ]] && args+=(-H "Content-Type: application/json" -d "$body")
  local out
  out="$(curl "${args[@]}" "${BASE_URL}${path}")"
  STATUS="${out##*$'\n'}"
  BODY="${out%$'\n'*}"
  echo "${method} ${path} -> ${STATUS} $(echo "$BODY" | head -c 300)"
}

# expect STATUS_CODE LABEL
expect() {
  if [[ "$STATUS" == "$1" ]]; then
    echo "  ok: $2"
  else
    echo "  FAIL: $2 (expected $1, got ${STATUS})"
    FAILURES=$((FAILURES + 1))
  fi
}

login() {
  TOKEN=""
  call POST /auth/login "{\"username\":\"${SMOKE_USER}\",\"password\":\"${SMOKE_PASSWORD}\"}"
  expect 200 "owner logs in"
  TOKEN="$(echo "$BODY" | jq -r .accessToken)"
}

finish() {
  echo
  if [[ "$FAILURES" -eq 0 ]]; then echo "SMOKE PASSED"; else echo "SMOKE FAILED: ${FAILURES} check(s)"; exit 1; fi
}
