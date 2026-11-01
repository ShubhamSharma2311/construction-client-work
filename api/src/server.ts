import { serve } from "@hono/node-server";
import { buildApp } from "./app.ts";
import { loadEnv } from "./config/env.ts";
import { systemClock } from "./lib/clock.ts";
import { openLocalLedger } from "./lib/local-db.ts";
import { consoleLog } from "./lib/log.ts";
import { printMailer, resendMailer } from "./lib/mailer.ts";

// The API on this machine, for development; Cloudflare runs it from src/worker.
const env = loadEnv();
const app = buildApp({
  db: await openLocalLedger(env.DATABASE_URL),
  clock: systemClock,
  log: consoleLog,
  jwtSecret: env.JWT_SECRET,
  corsOrigins: env.CORS_ORIGINS,
  secureCookies: env.NODE_ENV === "production",
  // loadEnv guarantees a key in production; printing is for development only.
  mailer: env.RESEND_API_KEY ? resendMailer(env.RESEND_API_KEY, env.MAIL_FROM) : printMailer(),
  appUrl: env.APP_URL,
});

serve({
  port: env.PORT,
  hostname: "0.0.0.0",
  fetch: (request, { incoming }) => {
    // There is no Cloudflare here to name the visitor: the socket's address stands in.
    const headers = new Headers(request.headers);
    headers.set("cf-connecting-ip", incoming.socket.remoteAddress ?? "unknown");
    return app.fetch(new Request(request, { headers }));
  },
});
