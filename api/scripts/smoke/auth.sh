#!/usr/bin/env bash
# Smoke check for Block 1 (auth) against a running server with an owner account.
source "$(dirname "$0")/lib.sh"
wait_for_server

call GET /auth/me
expect 401 "protected route refuses a request without a token"

call POST /auth/login "{\"username\":\"${SMOKE_USER}\",\"password\":\"wrong-password\"}"
expect 401 "wrong password is refused"

login
REFRESH="$(echo "$BODY" | jq -r .refreshToken)"

call GET /auth/me
expect 200 "access token opens /auth/me"

TOKEN=""
call POST /auth/refresh "{\"refreshToken\":\"${REFRESH}\"}"
expect 200 "refresh token gives a new session"
NEW_REFRESH="$(echo "$BODY" | jq -r .refreshToken)"

call POST /auth/refresh "{\"refreshToken\":\"${REFRESH}\"}"
expect 401 "a used refresh token is refused"

call POST /auth/refresh "{\"refreshToken\":\"${NEW_REFRESH}\"}"
expect 401 "reuse signed out the whole login"

finish
