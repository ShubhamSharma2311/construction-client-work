import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestPrisma, resetDb } from "../../test/db.ts";
import { fromPrismaError } from "./prisma-errors.ts";

const db = createTestPrisma();

beforeEach(async () => {
  await resetDb(db);
});

afterAll(async () => {
  await db.$disconnect();
});

async function errorFrom(operation: () => Promise<unknown>): Promise<unknown> {
  try {
    await operation();
  } catch (error) {
    return error;
  }
  throw new Error("expected the operation to fail");
}

describe("fromPrismaError", () => {
  it("maps a unique violation to 409 naming the constraint", async () => {
    await db.khet.create({ data: { name: "Nadi", nameKey: "nadi" } });

    const error = await errorFrom(() =>
      db.khet.create({ data: { name: "Nadi", nameKey: "nadi" } }),
    );

    expect(fromPrismaError(error)).toMatchObject({
      code: "CONFLICT",
      details: { constraint: "Khet.nameKey" },
    });
  });

  it("maps a foreign key violation to 409", async () => {
    const error = await errorFrom(() =>
      db.driverSalaryRate.create({
        data: { driverId: 999, monthlyPaise: 100, effectiveFrom: new Date("2026-01-01") },
      }),
    );

    // SQLite does not say which foreign key failed.
    expect(fromPrismaError(error)).toMatchObject({ code: "CONFLICT" });
  });

  it("maps a missing record to 404", async () => {
    const error = await errorFrom(() =>
      db.khet.update({ where: { id: 999 }, data: { name: "x" } }),
    );

    expect(fromPrismaError(error)).toMatchObject({ code: "NOT_FOUND" });
  });

  it("maps a CHECK violation to 409 naming the rule", async () => {
    const error = await errorFrom(() =>
      db.partner.create({ data: { name: "Manish", shareBasisPoints: 20_000 } }),
    );

    expect(fromPrismaError(error)).toMatchObject({
      code: "CONFLICT",
      details: { constraint: "Partner_share_range" },
    });
  });

  it("maps a refusal by a database trigger to 409 naming the rule", async () => {
    await db.$executeRawUnsafe(
      `CREATE TEMP TRIGGER "probe" BEFORE INSERT ON "Labourer"
       BEGIN SELECT RAISE(ABORT, 'Labourer_probe_rule: refused for the test'); END`,
    );
    try {
      const error = await errorFrom(() => db.labourer.create({ data: { name: "Ramu" } }));

      expect(fromPrismaError(error)).toMatchObject({
        code: "CONFLICT",
        details: { constraint: "Labourer_probe_rule" },
      });
    } finally {
      await db.$executeRawUnsafe(`DROP TRIGGER "probe"`);
    }
  });

  it("leaves other errors alone", () => {
    expect(fromPrismaError(new Error("boom"))).toBeNull();
  });
});
