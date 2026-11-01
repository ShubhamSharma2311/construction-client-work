#!/usr/bin/env bash
# Creates the owner's sign-in on a new install, once. Needs the SETUP_TOKEN Worker secret;
# delete that secret afterwards (npx wrangler secret delete SETUP_TOKEN).
# Usage: APP_URL=https://sawariya-seth.<subdomain>.workers.dev npm run setup-owner
set -euo pipefail

[ -n "${APP_URL:-}" ] || {
  echo "error: set APP_URL to the website's address" >&2
  exit 1
}
read -rsp "Setup token (hidden): " SETUP_TOKEN
echo
read -rp "Owner's username: " OWNER_USERNAME
read -rsp "Owner's first password, at least 10 characters (hidden): " OWNER_PASSWORD
echo
export SETUP_TOKEN OWNER_USERNAME OWNER_PASSWORD

# The body is built by node from the environment, so nothing secret appears in a command line.
node -e 'process.stdout.write(JSON.stringify({
  setupToken: process.env.SETUP_TOKEN,
  username: process.env.OWNER_USERNAME,
  password: process.env.OWNER_PASSWORD,
}))' | curl --fail-with-body -sS -X POST "${APP_URL%/}/api/auth/setup-owner" \
  -H "content-type: application/json" --data-binary @-
echo
echo "Owner created. Now delete the setup token: npx wrangler secret delete SETUP_TOKEN"
