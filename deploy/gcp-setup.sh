#!/usr/bin/env bash
# One-time Google Cloud setup: the database, the image registry, the secrets, the API's
# service account and a budget alert. Safe to re-run: anything that exists is kept.
# Usage: deploy/gcp-setup.sh
source "$(dirname "$0")/lib.sh"

echo "== APIs"
gc services enable run.googleapis.com sqladmin.googleapis.com artifactregistry.googleapis.com \
  cloudbuild.googleapis.com secretmanager.googleapis.com billingbudgets.googleapis.com

echo "== Image registry"
if ! gc artifacts repositories describe "$REGISTRY" --location "$GCP_REGION" >/dev/null 2>&1; then
  gc artifacts repositories create "$REGISTRY" --repository-format=docker --location "$GCP_REGION"
fi

echo "== Database (Postgres 16, smallest size; takes about 10 minutes the first time)"
if ! gc sql instances describe "$SQL_INSTANCE" >/dev/null 2>&1; then
  # Backups daily at 02:00 IST, kept 7 days, with point-in-time recovery over those days.
  gc sql instances create "$SQL_INSTANCE" \
    --database-version=POSTGRES_16 --edition=ENTERPRISE --tier=db-f1-micro \
    --region="$GCP_REGION" --availability-type=zonal \
    --storage-type=SSD --storage-size=10 --storage-auto-increase \
    --backup-start-time=20:30 --retained-backups-count=7 \
    --enable-point-in-time-recovery --retained-transaction-log-days=7 \
    --deletion-protection
fi
if ! gc sql databases describe "$SQL_DATABASE" --instance "$SQL_INSTANCE" >/dev/null 2>&1; then
  gc sql databases create "$SQL_DATABASE" --instance "$SQL_INSTANCE"
fi

echo "== Database user and its connection secret"
if gc sql users list --instance "$SQL_INSTANCE" --format='value(name)' | grep -qx "$SQL_USER"; then
  # The password exists only inside the database-url secret, so the two must not drift.
  gc secrets describe database-url >/dev/null 2>&1 ||
    fail "database user $SQL_USER exists but the database-url secret does not; reset the user's password and recreate the secret"
  echo "user $SQL_USER exists, kept"
else
  db_password="$(openssl rand -hex 24)"
  gc sql users create "$SQL_USER" --instance "$SQL_INSTANCE" --password="$db_password" >/dev/null
  printf 'postgresql://%s:%s@localhost/%s?host=/cloudsql/%s' \
    "$SQL_USER" "$db_password" "$SQL_DATABASE" "$SQL_CONNECTION" | secret_create database-url
  unset db_password
fi

echo "== Secrets"
openssl rand -hex 32 | tr -d '\n' | secret_create jwt-secret
openssl rand -hex 32 | tr -d '\n' | secret_create proxy-secret
if ! gc secrets describe resend-api-key >/dev/null 2>&1; then
  read -rsp "Paste the Resend API key (hidden): " resend_key
  echo
  [ -n "$resend_key" ] || fail "no Resend key given"
  printf '%s' "$resend_key" | secret_create resend-api-key
  unset resend_key
else
  echo "secret resend-api-key exists, kept"
fi

echo "== Service account for the API"
if ! gc iam service-accounts describe "$SERVICE_ACCOUNT" >/dev/null 2>&1; then
  gc iam service-accounts create sawariya-api --display-name "Sawariya Seth API"
fi
for role in roles/cloudsql.client roles/secretmanager.secretAccessor; do
  gc projects add-iam-policy-binding "$GCP_PROJECT" \
    --member "serviceAccount:$SERVICE_ACCOUNT" --role "$role" --condition=None >/dev/null
done

echo "== Budget alert (emails the billing admins at 50%, 90% and 100% of \$20 a month)"
billing="$(gc billing projects describe "$GCP_PROJECT" --format='value(billingAccountName)')"
[ -n "$billing" ] || fail "the project has no billing account; link one in the console first"
if ! gc billing budgets list --billing-account "${billing#billingAccounts/}" \
  --format='value(displayName)' | grep -qx "sawariya-seth"; then
  gc billing budgets create --billing-account "${billing#billingAccounts/}" \
    --display-name sawariya-seth --budget-amount 20USD \
    --filter-projects "projects/$GCP_PROJECT" \
    --threshold-rule percent=0.5 --threshold-rule percent=0.9 --threshold-rule percent=1.0
fi

echo "Done. Next: deploy/api.sh"
