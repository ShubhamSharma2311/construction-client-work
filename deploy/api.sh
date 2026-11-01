#!/usr/bin/env bash
# Releases the API: builds the image on Cloud Build, brings the database up to date, then
# switches Cloud Run to the new image. Usage: deploy/api.sh
source "$(dirname "$0")/lib.sh"

# The image is named after the commit, so what runs can always be traced to the code.
if [ -n "$(git -C "$ROOT" status --porcelain -- api)" ]; then
  fail "api/ has uncommitted changes; commit them so the release matches a commit"
fi
image="$GCP_REGION-docker.pkg.dev/$GCP_PROJECT/$REGISTRY/api:$(git -C "$ROOT" rev-parse --short HEAD)"

echo "== Building $image"
gc builds submit "$ROOT/api" --tag "$image"

echo "== Updating the database"
# Runs before the new code serves anyone; a failed migration stops the release here.
gc run jobs deploy sawariya-migrate --image "$image" --region "$GCP_REGION" \
  --service-account "$SERVICE_ACCOUNT" --set-cloudsql-instances "$SQL_CONNECTION" \
  --set-secrets DATABASE_URL=database-url:latest \
  --command npx --args prisma,migrate,deploy \
  --max-retries 0 --task-timeout 10m --execute-now --wait

echo "== Releasing the API"
# Scales to zero when idle, so the first request after a quiet spell takes a few seconds.
gc run deploy "$SERVICE" --image "$image" --region "$GCP_REGION" \
  --service-account "$SERVICE_ACCOUNT" --add-cloudsql-instances "$SQL_CONNECTION" \
  --set-env-vars "$API_ENV" --set-secrets "$API_SECRETS" \
  --min-instances 0 --max-instances 2 --memory 512Mi --cpu 1 \
  --allow-unauthenticated

url="$(gc run services describe "$SERVICE" --region "$GCP_REGION" --format='value(status.url)')"
echo "API is live at $url (it answers only requests coming through the website)."
echo "Next: deploy/web.sh"
