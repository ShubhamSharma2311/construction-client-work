import { createPrisma, type Db } from "../src/lib/prisma.ts";

export function createTestPrisma(): Db {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set; vitest loads it from .env.test");
  return createPrisma(url);
}

interface Blocker {
  pid: number;
  state: string | null;
  age: string | null;
  query: string | null;
}

/**
 * Empties every application table so each test starts from a blank database. If an
 * earlier test left a transaction open, this fails within seconds and names it instead
 * of hanging the run.
 */
export async function resetDb(db: Db): Promise<void> {
  const tables = await db.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  if (tables.length === 0) return;
  const list = tables.map(({ tablename }) => `"${tablename}"`).join(", ");
  try {
    await db.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL lock_timeout = '5s'`);
      await tx.$executeRawUnsafe(`TRUNCATE ${list} RESTART IDENTITY CASCADE`);
    });
  } catch (error) {
    const blockers = await db.$queryRaw<Blocker[]>`
      SELECT pid, state, (now() - xact_start)::text AS age, left(query, 300) AS query
      FROM pg_stat_activity
      WHERE datname = current_database() AND pid <> pg_backend_pid() AND xact_start IS NOT NULL`;
    throw new Error(`resetDb could not truncate; open transactions: ${JSON.stringify(blockers)}`, {
      cause: error,
    });
  }
}
