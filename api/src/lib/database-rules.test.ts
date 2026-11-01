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

/** The database rule that refused a write, as the API's error mapping names it. */
async function refusedBy(write: () => Promise<unknown>): Promise<string | undefined> {
  try {
    await write();
  } catch (error) {
    const constraint = fromPrismaError(error)?.details?.["constraint"];
    return typeof constraint === "string" ? constraint : undefined;
  }
  throw new Error("expected the database to refuse the write");
}

// These rules back up the services: they hold even for a write that skips them.
describe("database rules", () => {
  it("keeps a royalty's period whole: both dates or neither, in order", async () => {
    const royalty = { category: "ROYALTY" as const, mode: "CASH" as const, amountPaise: 500_000 };
    const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

    expect(
      await refusedBy(() =>
        db.expense.create({
          data: { ...royalty, spentOn: day("2026-10-20"), periodFrom: day("2026-10-01") },
        }),
      ),
    ).toBe("Expense_royalty_period");
    expect(
      await refusedBy(() =>
        db.expense.create({
          data: {
            ...royalty,
            spentOn: day("2026-10-20"),
            periodFrom: day("2026-10-10"),
            periodTo: day("2026-10-01"),
          },
        }),
      ),
    ).toBe("Expense_royalty_period");
  });

  it("refuses a value that is not in a column's list, as Postgres enums did", async () => {
    const write = () =>
      db.$executeRawUnsafe(
        `INSERT INTO "Expense" ("category", "spentOn", "amountPaise", "mode", "notes", "updatedAt")
         VALUES ('BRIBES', '2026-10-20T00:00:00.000+00:00', 100, 'CASH', 'x', '2026-10-20T00:00:00.000+00:00')`,
      );

    expect(await refusedBy(write)).toBe("Expense_category_values");
  });
});
