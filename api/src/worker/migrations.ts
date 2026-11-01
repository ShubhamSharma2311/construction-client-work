import init from "../../migrations/0001_init.sql";
import type { Migration } from "../lib/migrate.ts";

// Every file in migrations/, in order. The Worker bundles them as text; a test checks none is missing.
export const MIGRATIONS: Migration[] = [{ name: "0001_init", sql: init }];
