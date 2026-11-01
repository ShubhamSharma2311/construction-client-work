import { createPrisma, type Db } from "../src/lib/prisma.ts";

export function createTestPrisma(): Db {
  const url = process.env["DATABASE_URL"];
  if (!url) throw new Error("DATABASE_URL is not set; vitest loads it from .env.test");
  return createPrisma(url);
}

/** Empties every application table so each test starts from a blank database. */
export async function resetDb(db: Db): Promise<void> {
  const tables = await db.$queryRaw<{ name: string }[]>`
    SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`;
  // Foreign keys are switched off so tables can be emptied in any order.
  await db.$executeRawUnsafe("PRAGMA foreign_keys = OFF");
  try {
    for (const { name } of tables) await db.$executeRawUnsafe(`DELETE FROM "${name}"`);
    await db.$executeRawUnsafe("DELETE FROM sqlite_sequence");
  } finally {
    await db.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  }
}
