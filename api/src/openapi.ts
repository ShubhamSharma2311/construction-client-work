import { buildApp } from "./app.ts";
import { systemClock } from "./lib/clock.ts";
import { printMailer } from "./lib/mailer.ts";
import { ledgerPrisma } from "./lib/prisma.ts";
import type { LedgerStorage } from "./lib/storage-adapter.ts";

// The description comes from route schemas alone. Building the app does not query the
// database or sign anything, so placeholder settings are enough here.
const NO_STORAGE: LedgerStorage = {
  sql: {
    exec() {
      throw new Error("building the API description must not query the database");
    },
  },
  transaction: () => Promise.reject(new Error("building the API description must not write")),
};
const UNUSED_SECRET = "openapi-spec-only-never-signs-anything";

/** The API's OpenAPI 3 description, used to generate the frontend's types. */
export async function buildOpenApiSpec(): Promise<unknown> {
  const db = ledgerPrisma(NO_STORAGE);
  const app = buildApp({
    db,
    clock: systemClock,
    jwtSecret: UNUSED_SECRET,
    logLevel: "silent",
    corsOrigins: [],
    trustProxyHops: 0,
    secureCookies: true,
    mailer: printMailer(),
    appUrl: "https://unused.example",
  });
  try {
    await app.ready();
    return app.swagger();
  } finally {
    await app.close();
    await db.$disconnect();
  }
}
