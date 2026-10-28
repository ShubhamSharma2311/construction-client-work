import { buildApp } from "./app.ts";
import { loadEnv } from "./config/env.ts";
import { createPrisma } from "./lib/prisma.ts";

const env = loadEnv();
const db = createPrisma(env.DATABASE_URL);
const app = buildApp({ db, logLevel: env.LOG_LEVEL });

app.addHook("onClose", async () => {
  await db.$disconnect();
});

// Cloud Run sends SIGTERM before stopping an instance; finish in-flight requests first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, "shutdown failed");
        process.exit(1);
      },
    );
  });
}

await app.listen({ port: env.PORT, host: "0.0.0.0" });
