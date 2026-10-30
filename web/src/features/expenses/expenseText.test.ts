import { describe, expect, it } from "vitest";
import { EXPENSE } from "../../test/fixtures.ts";
import { expenseFor } from "./expenseText.ts";

describe("expenseFor", () => {
  it("names the tractor, driver and litres of diesel", () => {
    expect(expenseFor(EXPENSE)).toBe("RJ 21 RA 4412, Suresh, 47.5 L");
  });

  it("falls back to the note when nothing else is named", () => {
    const police = {
      ...EXPENSE,
      category: "POLICE" as const,
      tractor: null,
      driver: null,
      dieselLitres: null,
      notes: "Checkpost",
    };

    expect(expenseFor(police)).toBe("Checkpost");
  });
});
