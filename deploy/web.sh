#!/usr/bin/env bash
# Releases the website to Cloudflare Workers, pointed at the live API.
# Usage: deploy/web.sh
source "$(dirname "$0")/lib.sh"

api_origin="$(gc run services describe "$SERVICE" --region "$GCP_REGION" --format='value(status.url)')"
[ -n "$api_origin" ] || fail "the API is not on Cloud Run yet; run deploy/api.sh first"

cd "$ROOT/web"
npm run build

# The proxy secret travels to Cloudflare with the deploy, through a file only this user
# can read that is removed whatever happens, so it is never printed or left on disk.
secrets_file="$(mktemp)"
trap 'rm -f "$secrets_file"' EXIT
chmod 600 "$secrets_file"
proxy_secret="$(gc secrets versions access latest --secret proxy-secret)"
printf '{"PROXY_SECRET":"%s"}' "$proxy_secret" >"$secrets_file"
unset proxy_secret

npx wrangler deploy --profile "$CF_PROFILE" \
  --var "API_ORIGIN:$api_origin" --secrets-file "$secrets_file"

echo "Website is live at $APP_URL"
