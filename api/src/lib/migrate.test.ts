import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { migrate } from "./migrate.ts";
import { nodeStorage } from "./node-storage.ts";

const FIRST = {
  name: "0001_init",
  sql: `CREATE TABLE "Note" ("id" INTEGER PRIMARY KEY, "text" TEXT)`,
};
const SECOND = { name: "0002_more", sql: `ALTER TABLE "Note" ADD COLUMN "author" TEXT` };

function freshStorage() {
  return nodeStorage(join(mkdtempSync(join(tmpdir(), "ledger-")), "test.db"));
}

describe("migrate", () => {
  it("applies each migration once, in order, and only the new ones later", async () => {
    const storage = freshStorage();

    expect(await migrate(storage, [FIRST])).toEqual(["0001_init"]);
    expect(await migrate(storage, [FIRST, SECOND])).toEqual(["0002_more"]);
    expect(await migrate(storage, [FIRST, SECOND])).toEqual([]);

    const columns = Array.from(
      storage.sql.exec(`SELECT name FROM pragma_table_info('Note')`).raw(),
    );
    expect(columns.map((row) => row[0])).toEqual(["id", "text", "author"]);
  });

  it("leaves nothing half-applied when a migration fails", async () => {
    const storage = freshStorage();
    const broken = { name: "0002_broken", sql: `ALTER TABLE "Missing" ADD COLUMN "x" TEXT` };

    await expect(migrate(storage, [FIRST, broken])).rejects.toThrow(/Missing/);

    const tables = Array.from(
      storage.sql.exec(`SELECT name FROM sqlite_master WHERE type = 'table'`).raw(),
    );
    expect(tables).toEqual([]);
  });
});
