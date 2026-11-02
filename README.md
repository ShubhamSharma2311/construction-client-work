# Sawariya Seth Construction Materials

Accounts app for a sand (reti/bajri) trip business. It replaces paper registers for trips, customer dues, drivers, diesel, expenses, tractor EMI and the partner account.

| Part | Built with | Runs on |
|---|---|---|
| `web/` | React, Vite, shadcn/ui | Cloudflare Workers (static assets) |
| `api/` | TypeScript, Hono, Prisma | Cloudflare Workers, inside one Durable Object |
| Database | SQLite | The Durable Object's own storage, with 30-day point-in-time restore |
| Email | Resend | "Forgot password" links |

One Worker serves the website and `/api`. The API and its database live in a single Durable Object, so every request runs one at a time against one SQLite database, and nothing outside the Worker can reach it.

## Run it locally

```sh
cd api
cp .env.example .env
npm install
OWNER_PASSWORD='choose-a-password' npm run create-owner -- --username owner
npm run dev
```

In a second terminal:

```sh
cd web
npm install
npm run dev
```

Open http://localhost:5173. The API keeps its data in `api/dev.db`, through the same database code as Cloudflare. Without a Resend key, emails are printed in the API's terminal.

To run the exact Cloudflare setup on this machine instead (Worker, Durable Object and all), put `JWT_SECRET` and `SETUP_TOKEN` in `api/.dev.vars` and run `npm run dev:worker` in `api/`. Then open http://localhost:8787.

## Checks

- `npm run gate` in `api/` or `web/`: types, lint, tests with coverage (and the production build in `web/`).
- `E2E_USERNAME=owner E2E_PASSWORD='...' npm run e2e` in `web/`: browser tests against the real API on an Android phone, an iPhone, a tablet and a desktop.
- `npm run api:types` in `web/` regenerates the API types after an API change.

## Change the database

Edit `api/prisma/schema.prisma`, then write the SQL for the change and list it for the Worker:

```sh
cd api
git show HEAD:api/prisma/schema.prisma > /tmp/old-schema.prisma
DATABASE_URL=file:./dev.db npx prisma migrate diff \
  --from-schema /tmp/old-schema.prisma --to-schema prisma/schema.prisma \
  --script -o migrations/0002_what_changed.sql
```

Add the file to `api/src/worker/migrations.ts` (a test fails until it is there). The Durable Object applies new migrations when it next starts; local runs and tests apply them too.

## Deploy to Cloudflare

Once, on a new Cloudflare account (Workers Paid plan):

```sh
cd api
npx wrangler auth create sawariya          # log in to the client's account
npx wrangler auth activate sawariya .      # use that login in this folder only
openssl rand -hex 32 | npx wrangler secret put JWT_SECRET
openssl rand -hex 32 | tee /dev/tty | npx wrangler secret put SETUP_TOKEN   # note it for the next step
npx wrangler secret put RESEND_API_KEY     # paste the key when asked
```

Then, every release:

```sh
APP_URL=https://sawariya-seth-construction-materials.<subdomain>.workers.dev npm run deploy
```

After the first release, create the owner and remove the setup token:

```sh
APP_URL=https://sawariya-seth-construction-materials.<subdomain>.workers.dev npm run setup-owner
npx wrangler secret delete SETUP_TOKEN
```

Sign in, set the business details in Settings, and the email for a forgotten password in Settings > Password.

Without a verified domain, Resend only delivers to the email its account was made with, so make the Resend account with the owner's email.
