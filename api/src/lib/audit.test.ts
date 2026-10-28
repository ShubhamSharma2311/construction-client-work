import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrisma, resetDb } from "../../test/db.ts";
import { writeAudit } from "./audit.ts";

const db = createTestPrisma();

beforeEach(async () => {
  await resetDb(db);
});

afterAll(async () => {
  await db.$disconnect();
});

describe("writeAudit", () => {
  it("stores before and after as JSON, converting Dates and BigInts", async () => {
    await db.$transaction(async (tx) => {
      await writeAudit(tx, {
        entity: "Trip",
        entityId: 7n,
        action: "UPDATE",
        before: { amountPaise: 500000, tripDate: new Date("2026-10-28T00:00:00Z") },
        after: { amountPaise: 450000, ref: 12n },
      });
    });

    const rows = await db.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      entity: "Trip",
      entityId: "7",
      action: "UPDATE",
      before: { amountPaise: 500000, tripDate: "2026-10-28T00:00:00.000Z" },
      after: { amountPaise: 450000, ref: "12" },
    });
  });

  it("stores SQL NULL when there is no before state", async () => {
    await db.$transaction(async (tx) => {
      await writeAudit(tx, { entity: "Trip", entityId: 1, action: "CREATE", after: { a: 1 } });
    });

    const row = await db.auditLog.findFirstOrThrow();
    expect(row.before).toBeNull();
  });

  it("leaves no audit row when the surrounding transaction rolls back", async () => {
    await expect(
      db.$transaction(async (tx) => {
        await writeAudit(tx, { entity: "Trip", entityId: 1, action: "CREATE", after: { a: 1 } });
        throw new Error("business rule failed after the audit write");
      }),
    ).rejects.toThrow("business rule failed");

    expect(await db.auditLog.count()).toBe(0);
  });
});
