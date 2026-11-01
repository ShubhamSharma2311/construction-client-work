import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, type Prisma } from "../generated/prisma/client.ts";

export type Db = PrismaClient;
export type Tx = Prisma.TransactionClient;

/** A SQLite file on this machine, for development and tests; production uses the Durable Object. */
export function createPrisma(databaseUrl: string): Db {
  return new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: databaseUrl }) });
}
