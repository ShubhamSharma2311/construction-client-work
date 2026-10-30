import { describe, expect, it } from "vitest";
import { expenseQuery, readExpenseFilters, writeExpenseFilters } from "./expenseFilters.ts";

const month = { from: "2026-10-01", to: "2026-10-28" };

describe("expense filters in the address", () => {
  it("round-trips every filter", () => {
    const filters = {
      range: month,
      category: "DIESEL" as const,
      tractorId: "3",
      driverId: "2",
      labourerId: "",
      mode: "ONLINE" as const,
      deleted: false,
    };

    expect(readExpenseFilters(new URLSearchParams(writeExpenseFilters(filters)), null)).toEqual(
      filters,
    );
  });

  it("drops a category or mode the API does not have", () => {
    const filters = readExpenseFilters(new URLSearchParams("category=PETROL&mode=CHEQUE"), month);

    expect(filters.category).toBe("");
    expect(filters.mode).toBe("");
  });

  it("asks the API only for what is set", () => {
    const filters = readExpenseFilters(
      new URLSearchParams("range=all&category=LABOUR&labourer=4"),
      month,
    );

    expect(expenseQuery(filters)).toEqual({ category: "LABOUR", labourerId: 4 });
  });
});
