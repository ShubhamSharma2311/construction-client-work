import { describe, expect, it } from "vitest";
import { dueText, nextUnpaid } from "./emiText.ts";
import type { ScheduleLine } from "./useLoans.ts";

const line = (number: number, month: string, status: ScheduleLine["status"]): ScheduleLine => ({
  number,
  month,
  dueDate: `${month}-05`,
  status,
  payment: null,
});

describe("EMI wording", () => {
  it.each([
    ["OVERDUE", 1, "1 day late"],
    ["OVERDUE", 23, "23 days late"],
    ["DUE_TODAY", 0, "due today"],
    ["UPCOMING", 0, "due 5 Nov"],
  ] as const)("says %s (%i days late) as %j", (status, daysLate, text) => {
    expect(dueText(status, "2026-11-05", daysLate, "2026-10-28")).toBe(text);
  });
});

describe("the next EMI to pay", () => {
  it("is the oldest month not yet paid", () => {
    const schedule = [
      line(1, "2026-08", "PAID"),
      line(2, "2026-09", "OVERDUE"),
      line(3, "2026-10", "UPCOMING"),
    ];

    expect(nextUnpaid(schedule)?.month).toBe("2026-09");
  });

  it("is nothing once every month is paid or the loan is closed", () => {
    expect(nextUnpaid([line(1, "2026-08", "PAID"), line(2, "2026-09", "CLOSED")])).toBeNull();
  });
});
