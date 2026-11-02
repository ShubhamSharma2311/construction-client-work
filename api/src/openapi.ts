import { routeList } from "./app.ts";
import { systemClock } from "./lib/clock.ts";
import { silentLog } from "./lib/log.ts";
import { printMailer } from "./lib/mailer.ts";
import { describeRoutes } from "./lib/openapi-doc.ts";
import { ledgerPrisma } from "./lib/prisma.ts";
import type { LedgerStorage } from "./lib/storage-adapter.ts";

// The description comes from route schemas alone; no handler runs, so nothing here is used.
const NO_STORAGE: LedgerStorage = {
  sql: {
    exec() {
      throw new Error("building the API description must not query the database");
    },
  },
  transaction: () => Promise.reject(new Error("building the API description must not write")),
};

/** The API's OpenAPI 3 description, used to generate the frontend's types. */
export function buildOpenApiSpec(): unknown {
  const routes = routeList({
    db: ledgerPrisma(NO_STORAGE),
    clock: systemClock,
    log: silentLog,
    jwtSecret: "openapi-spec-only-never-signs-anything",
    secureCookies: true,
    mailer: printMailer(),
    appUrl: "https://unused.example",
  });
  return describeRoutes(routes, {
    title: "Sawariya Seth Construction Materials API",
    version: "1.0.0",
  });
}
