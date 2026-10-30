import { describe, expect, it } from "vitest";
import { driverStanding, entryChange, entryText } from "./driverText.ts";

describe("a driver's standing", () => {
  it.each([
    [1500000, "You owe Suresh ₹15,000", true],
    [-300000, "Suresh has ₹3,000 in advance", false],
    [0, "Suresh's account is settled", null],
  ])("reads a balance of %i paise", (balance, text, owesDriver) => {
    expect(driverStanding("Suresh", balance)).toEqual({ text, owesDriver });
  });
});

describe("a driver's account line", () => {
  it.each([
    [
      { type: "EARNED_SALARY", month: "2026-09", note: null, mode: null },
      /^Salary for Sept? 2026$/,
    ],
    [
      { type: "EARNED_SALARY", month: "2026-09", note: "2 days off", mode: null },
      /^Salary for Sept? 2026 \(2 days off\)$/,
    ],
    [{ type: "PAID_ADVANCE", month: null, note: "tyre", mode: "CASH" }, /^Advance, cash: tyre$/],
    [
      { type: "PAID_SALARY", month: "2026-08", note: null, mode: "ONLINE" },
      /^Salary paid for Aug 2026, online$/,
    ],
    [
      { type: "OPENING_BALANCE", month: null, note: null, mode: null },
      /^Balance from the old register$/,
    ],
    [{ type: "EARNED_BONUS", month: null, note: "Diwali", mode: null }, /^Bonus earned: Diwali$/],
  ] as const)("words %j", (line, text) => {
    expect(entryText(line)).toMatch(text);
  });

  it('signs a change by what it does to the balance, never "+−"', () => {
    expect(entryChange(1500000, 0)).toBe("+₹15,000");
    expect(entryChange(0, 500000)).toBe("−₹5,000");
    expect(entryChange(-200000, 0)).toBe("−₹2,000");
  });
});
