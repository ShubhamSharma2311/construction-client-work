import Database from "better-sqlite3";
import type { LedgerStorage, SqlCursor } from "./storage-adapter.ts";

const NO_ROWS: SqlCursor = { columnNames: [], raw: () => [] };

/**
 * A SQLite file on this machine standing in for the Durable Object's storage, so local runs
 * and tests go through the same Prisma adapter as Cloudflare does.
 */
export function nodeStorage(path: string): LedgerStorage {
  const db = new Database(path);
  // Durable Objects enforce foreign keys; a plain SQLite connection must be told to.
  db.pragma("foreign_keys = ON");
  return {
    sql: {
      exec(query, ...bindings) {
        // Like the Durable Object, a script of several statements runs whole.
        if (bindings.length === 0 && hasSeveralStatements(query)) {
          db.exec(query);
          return NO_ROWS;
        }
        const statement = db.prepare(query);
        if (!statement.reader) {
          statement.run(...bindings);
          return NO_ROWS;
        }
        const rows = statement.raw(true).all(...bindings) as unknown[][];
        return { columnNames: statement.columns().map((column) => column.name), raw: () => rows };
      },
    },
    async transaction(closure) {
      db.exec("BEGIN");
      try {
        const result = await closure();
        db.exec("COMMIT");
        return result;
      } catch (error) {
        // SQLite may already have rolled back (a failed COMMIT); the original error is the news.
        if (db.inTransaction) db.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

function hasSeveralStatements(query: string): boolean {
  return query.trim().replace(/;\s*$/, "").includes(";");
}
