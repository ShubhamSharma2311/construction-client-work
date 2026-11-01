import type { LedgerStorage } from "./storage-adapter.ts";

export interface Migration {
  /** Applied in name order, so names start with a sequence number: 0001_init. */
  name: string;
  sql: string;
}

/**
 * Brings the ledger's SQLite storage up to date. All pending migrations apply in one
 * transaction with their records, so a failure leaves the database as it was.
 * Returns the names applied this time.
 */
export async function migrate(storage: LedgerStorage, migrations: Migration[]): Promise<string[]> {
  return storage.transaction(() => {
    storage.sql.exec(
      `CREATE TABLE IF NOT EXISTS "_Migration" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)`,
    );
    const done = new Set(
      Array.from(storage.sql.exec(`SELECT "name" FROM "_Migration"`).raw(), (row) =>
        String(row[0]),
      ),
    );
    const pending = migrations
      .filter((migration) => !done.has(migration.name))
      .sort((a, b) => a.name.localeCompare(b.name));
    for (const migration of pending) {
      Array.from(storage.sql.exec(migration.sql).raw());
      storage.sql.exec(
        `INSERT INTO "_Migration" ("name", "appliedAt") VALUES (?, ?)`,
        migration.name,
        new Date().toISOString(),
      );
    }
    return Promise.resolve(pending.map((migration) => migration.name));
  });
}
