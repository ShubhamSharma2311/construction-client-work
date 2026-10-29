# Sand Trip Ledger

Ledger for a sand (reti/bajri) trip business. It replaces paper registers for trips, customer dues, drivers, diesel, expenses, tractor EMI and the partner account.

- `api/` is the backend: Node, TypeScript, Fastify, Prisma and PostgreSQL.
- `web/` is the frontend: React and Vite, to be served from Cloudflare Workers. It works on phones, tablets and computers.

## Run it locally

```sh
cd api
cp .env.example .env
docker compose up -d db
npm install
npm run db:deploy
OWNER_PASSWORD='choose-a-password' npm run create-owner -- --username owner
npm run dev
```

In a second terminal:

```sh
cd web
npm install
npm run dev
```

Open http://localhost:5173. The web dev server forwards `/api` to the API on port 3000, so the app and the API share one address, as they will in production.

## Checks

- `npm run gate` in `api/` or `web/`: types, lint, tests with coverage (and the production build in `web/`).
- `E2E_USERNAME=owner E2E_PASSWORD='...' npm run e2e` in `web/`: browser tests against the real API on an Android phone, an iPhone, a tablet and a desktop. Needs the dev database running.
- `npm run api:types` in `web/` regenerates the API types after an API change.
