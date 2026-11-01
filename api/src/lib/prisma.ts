import { PrismaClient, type Prisma } from "#prisma/client.ts";
import { type LedgerStorage, LedgerStorageAdapterFactory } from "./storage-adapter.ts";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

/** The ledger's database client over its SQLite storage (the Durable Object's, or a local file). */
export function ledgerPrisma(storage: LedgerStorage): Db {
  return new PrismaClient({ adapter: new LedgerStorageAdapterFactory(storage) });
}
