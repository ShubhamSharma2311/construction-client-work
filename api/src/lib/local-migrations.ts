import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Migration } from "./migrate.ts";

const DIRECTORY = join(import.meta.dirname, "../../migrations");

/** The migrations in migrations/, read from disk for local runs and tests. */
export function localMigrations(): Migration[] {
  return readdirSync(DIRECTORY)
    .filter((file) => file.endsWith(".sql"))
    .sort()
    .map((file) => ({
      name: file.replace(/\.sql$/, ""),
      sql: readFileSync(join(DIRECTORY, file), "utf8"),
    }));
}
