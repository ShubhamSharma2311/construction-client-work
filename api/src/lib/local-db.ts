import { localMigrations } from "./local-migrations.ts";
import { migrate } from "./migrate.ts";
import { nodeStorage } from "./node-storage.ts";
import { type Db, ledgerPrisma } from "./prisma.ts";

/** The ledger on a SQLite file on this machine, brought up to date first. */
export async function openLocalLedger(databaseUrl: string): Promise<Db> {
  if (!databaseUrl.startsWith("file:")) throw new Error(`Not a SQLite file URL: ${databaseUrl}`);
  const storage = nodeStorage(databaseUrl.slice("file:".length));
  await migrate(storage, localMigrations());
  return ledgerPrisma(storage);
}

/** A ledger file that is already up to date (tests migrate it once, before any file runs). */
export function createPrisma(databaseUrl: string): Db {
  if (!databaseUrl.startsWith("file:")) throw new Error(`Not a SQLite file URL: ${databaseUrl}`);
  return ledgerPrisma(nodeStorage(databaseUrl.slice("file:".length)));
}
