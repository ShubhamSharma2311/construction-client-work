import { buildApp } from "./app.ts";
import { systemClock } from "./lib/clock.ts";
import { printMailer } from "./lib/mailer.ts";
import { createPrisma } from "./lib/prisma.ts";

// The description comes from route schemas alone. Building the app does not connect to
// the database or sign anything, so placeholder settings are enough here.
const UNUSED_DATABASE_URL = "postgresql://unused:unused@127.0.0.1:1/unused";
const UNUSED_SECRET = "openapi-spec-only-never-signs-anything";

/** The API's OpenAPI 3 description, used to generate the frontend's types. */
export async function buildOpenApiSpec(): Promise<unknown> {
  const db = createPrisma(UNUSED_DATABASE_URL);
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
