import { readFileSync, rmSync } from "node:fs";
import { parseEnv } from "node:util";
import Database from "better-sqlite3";

/** Builds a fresh SQLite test database from the migrations once per run. */
export default function setup(): void {
  const env = parseEnv(readFileSync(".env.test", "utf8"));
  const url = env["DATABASE_URL"];
  if (!url?.startsWith("file:")) throw new Error(".env.test needs DATABASE_URL=file:...");
  const path = url.slice("file:".length);
  for (const suffix of ["", "-journal", "-wal", "-shm"]) rmSync(path + suffix, { force: true });

  const db = new Database(path);
  try {
    db.exec(readFileSync("migrations/0001_init.sql", "utf8"));
  } finally {
    db.close();
  }
}
