# Deploying Sawariya Seth

| Part | Where | What |
|---|---|---|
| Website | Cloudflare Workers | The built app; `/api/*` is forwarded to the API with a shared secret |
| API | Google Cloud Run, Mumbai | One container, scales to zero when idle |
| Database | Google Cloud SQL, Postgres 16 | Smallest size, daily backups kept 7 days, point-in-time recovery |
| Secrets | Google Secret Manager | Database URL, JWT secret, proxy secret, Resend key |
| Email | Resend | "Forgot password" links |

The API refuses any request that did not come through the website, so its own
`*.run.app` address is of no use on its own.

## First time

1. **Accounts.** Make sure these exist:
   - a Google Cloud project with billing (the free trial is fine);
   - a Cloudflare account for the client;
   - a Resend account, made with the owner's email. Without a verified domain, Resend only
     delivers to that address.
2. **Tools.** Install and sign in to each:
   ```sh
   brew install --cask google-cloud-sdk
   gcloud auth login
   cd web && npx wrangler auth create sawariya && npx wrangler auth activate sawariya .
   ```
   The wrangler commands add a separate login for the client's Cloudflare account, so any
   other wrangler login on this machine is left alone.
3. **Settings.** Fill in `deploy/settings.env`: the project ID, and the website address
   `https://sawariya-seth.<subdomain>.workers.dev`. The subdomain is shown on the
   Cloudflare dashboard under Workers & Pages.
4. **Run, in order.** Each script stops at the first error and prints no secrets.
   ```sh
   deploy/gcp-setup.sh      # once; asks for the Resend API key; about 10 minutes
   deploy/api.sh            # builds and releases the API
   deploy/web.sh            # releases the website
   deploy/create-owner.sh   # once; asks for the owner's first password
   ```
5. **Finish in the app.** Sign in at the website. Then:
   - set the business details in Settings;
   - set the email for a forgotten password in Settings > Password.

## Later releases

From a clean, committed checkout:

- `deploy/api.sh` when `api/` changed;
- `deploy/web.sh` when `web/` changed.

The API image is tagged with the commit, and database changes are applied before the new
code goes live.

## Costs

Cloud SQL costs about $12–15 a month; the other parts stay within free tiers at this size.
`gcp-setup.sh` sets a $20 monthly budget that emails the billing admins at 50%, 90% and
100%.

The free trial credit ends 90 days after sign-up. Before then, upgrade the billing
account, or the project stops.
