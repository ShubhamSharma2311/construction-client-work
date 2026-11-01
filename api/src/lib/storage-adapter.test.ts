import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { nodeStorage } from "./node-storage.ts";
import { ledgerPrisma } from "./prisma.ts";
import type { LedgerStorage } from "./storage-adapter.ts";

function freshStorage(): LedgerStorage {
  const storage = nodeStorage(join(mkdtempSync(join(tmpdir(), "ledger-")), "test.db"));
  storage.sql.exec(`CREATE TABLE "Labourer" ("id" INTEGER PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL, "phone" TEXT, "notes" TEXT, "isActive" BOOLEAN NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" DATETIME NOT NULL)`);
  return storage;
}

describe("the ledger storage adapter", () => {
  it("commits a transaction's writes together", async () => {
    const db = ledgerPrisma(freshStorage());

    await db.$transaction(async (tx) => {
      await tx.labourer.create({ data: { name: "Ramu" } });
      await tx.labourer.create({ data: { name: "Shyam" } });
    });

    expect(await db.labourer.count()).toBe(2);
  });

  it("rolls back every write when the transaction fails", async () => {
    const db = ledgerPrisma(freshStorage());

    await expect(
      db.$transaction(async (tx) => {
        await tx.labourer.create({ data: { name: "Ramu" } });
        throw new Error("rule broken");
      }),
    ).rejects.toThrow("rule broken");

    expect(await db.labourer.count()).toBe(0);
  });

  it("runs transactions that start together one after the other", async () => {
    const db = ledgerPrisma(freshStorage());
    const add = (name: string) =>
      db.$transaction(async (tx) => {
        const before = await tx.labourer.count();
        await new Promise((resolve) => setTimeout(resolve, 10));
        await tx.labourer.create({ data: { name: `${name} after ${String(before)}` } });
      });

    await Promise.all([add("a"), add("b"), add("c")]);

    const names = (await db.labourer.findMany({ orderBy: { id: "asc" } })).map((row) => row.name);
    expect(names).toEqual(["a after 0", "b after 1", "c after 2"]);
  });

  it("reports a storage that cannot open a transaction instead of waiting", async () => {
    const storage = freshStorage();
    const db = ledgerPrisma({
      sql: storage.sql,
      transaction: () => Promise.reject(new Error("storage refused")),
    });

    await expect(db.$transaction(async (tx) => tx.labourer.count())).rejects.toThrow(
      "storage refused",
    );
  });

  it("counts exactly the rows an update changed", async () => {
    const db = ledgerPrisma(freshStorage());
    await db.labourer.createMany({ data: [{ name: "Ramu" }, { name: "Shyam" }] });

    const { count } = await db.labourer.updateMany({
      where: { name: "Ramu" },
      data: { isActive: false },
    });

    expect(count).toBe(1);
    expect((await db.labourer.findFirstOrThrow({ where: { name: "Ramu" } })).isActive).toBe(false);
  });
});
