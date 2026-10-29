#!/usr/bin/env bash
# Smoke check for Block 1 (auth) against a running server with an owner account.
source "$(dirname "$0")/lib.sh"
wait_for_server

call GET /auth/me
expect 401 "protected route refuses a request without a token"

call POST /auth/login "{\"username\":\"${SMOKE_USER}\",\"password\":\"wrong-password\"}"
expect 401 "wrong password is refused"

login
grep -q "#HttpOnly_.*refresh_token" "$COOKIE_JAR" && echo "  ok: refresh token arrived as an HttpOnly cookie" \
  || { echo "  FAIL: no HttpOnly refresh cookie"; FAILURES=$((FAILURES + 1)); }
[[ "$(echo "$BODY" | jq 'has("refreshToken")')" == "false" ]] && echo "  ok: refresh token is not in the body" \
  || { echo "  FAIL: refresh token leaked into the body"; FAILURES=$((FAILURES + 1)); }

call GET /auth/me
expect 200 "access token opens /auth/me"

USED_JAR="$(mktemp)"
cp "$COOKIE_JAR" "$USED_JAR"
TOKEN=""
call POST /auth/refresh
expect 200 "the refresh cookie gives a new session"

LIVE_JAR="$COOKIE_JAR"
COOKIE_JAR="$USED_JAR"
call POST /auth/refresh
expect 401 "a used refresh cookie is refused"
COOKIE_JAR="$LIVE_JAR"
rm -f "$USED_JAR"

call POST /auth/refresh
expect 401 "reuse signed out the whole login"

login
call POST /auth/logout
expect 204 "logout succeeds"
call POST /auth/refresh
expect 401 "logout cleared the session"

finish
