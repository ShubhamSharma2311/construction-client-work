import { createPrisma, type Db } from "../src/lib/prisma.ts";

export function createTestPrisma(): Db {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set; vitest loads it from .env.test");
  return createPrisma(url);
}

/** Empties every application table so each test starts from a blank database. */
export async function resetDb(db: Db): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  await db.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
}
