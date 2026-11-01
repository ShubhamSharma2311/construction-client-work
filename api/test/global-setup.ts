import { readFileSync, rmSync } from "node:fs";
import { parseEnv } from "node:util";
import { localMigrations } from "../src/lib/local-migrations.ts";
import { migrate } from "../src/lib/migrate.ts";
import { nodeStorage } from "../src/lib/node-storage.ts";

/** Builds a fresh SQLite test database, through the same migrations the Worker applies. */
export default async function setup(): Promise<void> {
  const env = parseEnv(readFileSync(".env.test", "utf8"));
  const url = env["DATABASE_URL"];
  if (!url?.startsWith("file:")) throw new Error(".env.test needs DATABASE_URL=file:...");
  const path = url.slice("file:".length);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(path + suffix, { force: true });
  await migrate(nodeStorage(path), localMigrations());
}
