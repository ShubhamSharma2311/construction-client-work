#!/usr/bin/env bash
# Creates the owner's sign-in once, on the live database. The first password is typed here,
# kept in Secret Manager only while the job runs, then deleted.
# Usage: deploy/create-owner.sh
source "$(dirname "$0")/lib.sh"

image="$(gc run services describe "$SERVICE" --region "$GCP_REGION" \
  --format='value(spec.template.spec.containers[0].image)')"
[ -n "$image" ] || fail "the API is not on Cloud Run yet; run deploy/api.sh first"

read -rsp "First password for $OWNER_USERNAME (hidden, at least 10 characters): " password
echo
[ "${#password}" -ge 10 ] || fail "the password must be at least 10 characters"
printf '%s' "$password" | gc secrets create owner-password --replication-policy=automatic --data-file=- >/dev/null
unset password
trap 'gc secrets delete owner-password >/dev/null' EXIT

gc run jobs deploy sawariya-create-owner --image "$image" --region "$GCP_REGION" \
  --service-account "$SERVICE_ACCOUNT" --set-cloudsql-instances "$SQL_CONNECTION" \
  --set-env-vars "$API_ENV,PORT=8080" \
  --set-secrets "$API_SECRETS,OWNER_PASSWORD=owner-password:latest" \
  --command node --args "dist/cli/create-owner.js,--username,$OWNER_USERNAME" \
  --max-retries 0 --execute-now --wait

echo "Owner $OWNER_USERNAME created. Sign in at $APP_URL, then set the reset email in Settings > Password."
