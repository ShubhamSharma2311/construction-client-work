import { execFileSync } from "node:child_process";
import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import pg from "pg";

/** Applies all migrations to the test database once per run. */
export default async function setup(): Promise<void> {
  const env = parseEnv(readFileSync(".env.test", "utf8"));
  const url = env["DATABASE_URL"];
  if (!url) throw new Error(".env.test has no DATABASE_URL");

  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
  } catch (cause) {
    throw new Error(
      `Test database at ${url} is unreachable. Start it with: docker compose up -d db-test`,
      { cause },
    );
  } finally {
    await client.end();
  }

  execFileSync("npx", ["prisma", "migrate", "deploy"], {
    env: { ...process.env, DATABASE_URL: url },
    stdio: "pipe",
  });
}
