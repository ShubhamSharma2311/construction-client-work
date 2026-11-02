import { DurableObject } from "cloudflare:workers";
import { type App, buildApp } from "../app.ts";
import { systemClock } from "../lib/clock.ts";
import { consoleLog } from "../lib/log.ts";
import { migrate } from "../lib/migrate.ts";
import { ledgerPrisma } from "../lib/prisma.ts";
import type { LedgerStorage } from "../lib/storage-adapter.ts";
import { MIGRATIONS } from "./migrations.ts";
import { loadWorkerEnv, workerMailer } from "./worker-env.ts";

interface Env {
  ASSETS: Fetcher;
  LEDGER: DurableObjectNamespace<Ledger>;
  APP_URL: string;
  JWT_SECRET: string;
  RESEND_API_KEY?: string;
  MAIL_FROM?: string;
  SETUP_TOKEN?: string;
}

/**
 * The whole ledger: one Durable Object, so one SQLite database that only this Worker can
 * reach, serving the API one request at a time. Any other entry point added here (an alarm,
 * an RPC method) must go through the app too, or it could run inside a request's transaction.
 */
export class Ledger extends DurableObject<Env> {
  private readonly app: App;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    const settings = loadWorkerEnv({ ...env });
    const storage: LedgerStorage = {
      sql: ctx.storage.sql,
      transaction: (closure) => ctx.storage.transaction(closure),
    };
    this.app = buildApp({
      db: ledgerPrisma(storage),
      clock: systemClock,
      log: consoleLog,
      jwtSecret: settings.jwtSecret,
      corsOrigins: [settings.appUrl],
      secureCookies: settings.live,
      mailer: workerMailer(settings),
      appUrl: settings.appUrl,
      setupToken: settings.setupToken,
    });
    // Requests wait until the database is up to date.
    void ctx.blockConcurrencyWhile(async () => {
      await migrate(storage, MIGRATIONS);
    });
  }

  override fetch(request: Request): Promise<Response> {
    // The browser calls /api/...; the app's routes have no /api prefix.
    const url = new URL(request.url);
    url.pathname = url.pathname.replace(/^\/api(?=\/)/, "");
    return Promise.resolve(this.app.fetch(new Request(url, request)));
  }
}

export default {
  fetch(request, env) {
    // Only /api/* reaches this code (run_worker_first); the rest is the built website.
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return env.LEDGER.getByName("ledger").fetch(request);
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
