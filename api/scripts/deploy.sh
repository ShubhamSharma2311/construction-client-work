#!/usr/bin/env bash
# Builds the website and deploys the whole app (website, API and its database) to Cloudflare.
# Usage: APP_URL=https://sawariya-seth.<subdomain>.workers.dev npm run deploy
set -euo pipefail

case "${APP_URL:-}" in
  https://*) ;;
  *)
    echo "error: set APP_URL to the website's https address" >&2
    exit 1
    ;;
esac

cd "$(dirname "$0")/.."
npm --prefix ../web run build
npx wrangler deploy --var "APP_URL:${APP_URL%/}"
