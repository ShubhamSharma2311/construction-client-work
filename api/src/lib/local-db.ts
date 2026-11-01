import { nodeStorage } from "./node-storage.ts";
import { type Db, ledgerPrisma } from "./prisma.ts";

/** The ledger on a SQLite file on this machine (development, tests and the owner CLI). */
export function createPrisma(databaseUrl: string): Db {
  if (!databaseUrl.startsWith("file:")) throw new Error(`Not a SQLite file URL: ${databaseUrl}`);
  return ledgerPrisma(nodeStorage(databaseUrl.slice("file:".length)));
}
