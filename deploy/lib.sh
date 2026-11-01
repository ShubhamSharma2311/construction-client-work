# Shared by the deploy scripts: loads settings.env and the names every script uses.
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DEPLOY_DIR/.." && pwd)"
# shellcheck source=settings.env
source "$DEPLOY_DIR/settings.env"

fail() {
  echo "error: $*" >&2
  exit 1
}

for name in GCP_PROJECT GCP_REGION APP_URL CF_PROFILE OWNER_USERNAME; do
  value="${!name:-}"
  if [ -z "$value" ] || [ "$value" = "set-me" ]; then
    fail "$name is not set in deploy/settings.env"
  fi
done
command -v gcloud >/dev/null || fail "gcloud is not installed (brew install --cask google-cloud-sdk)"

SQL_INSTANCE=sawariya-db
SQL_DATABASE=sand_trip_ledger
SQL_USER=ledger
SQL_CONNECTION="$GCP_PROJECT:$GCP_REGION:$SQL_INSTANCE"
REGISTRY=sawariya
SERVICE=sawariya-api
SERVICE_ACCOUNT="sawariya-api@$GCP_PROJECT.iam.gserviceaccount.com"

gc() {
  gcloud --project "$GCP_PROJECT" --quiet "$@"
}

# Creates a secret from stdin, once. An existing secret is kept: rotating one is a
# deliberate act (gcloud secrets versions add), never a side effect of re-running setup.
secret_create() {
  local name=$1
  if gc secrets describe "$name" >/dev/null 2>&1; then
    echo "secret $name exists, kept"
    cat >/dev/null
  else
    gc secrets create "$name" --replication-policy=automatic --data-file=- >/dev/null
    echo "secret $name created"
  fi
}

# Environment and secrets for the API, shared by the service and its one-off jobs. Cloud
# Run sets PORT on the service itself and refuses it here; jobs add it (see create-owner.sh).
API_ENV="NODE_ENV=production,LOG_LEVEL=info,TRUST_PROXY_HOPS=2,APP_URL=$APP_URL,CORS_ORIGINS=$APP_URL"
API_SECRETS="DATABASE_URL=database-url:latest,JWT_SECRET=jwt-secret:latest,PROXY_SECRET=proxy-secret:latest,RESEND_API_KEY=resend-api-key:latest"
