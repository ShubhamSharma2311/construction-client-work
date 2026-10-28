import { describe, expect, it } from "vitest";
import { isoDateSchema, isoMonthSchema } from "../../lib/dates.ts";
import { buildSchedule, lastEmiMonth, summarise, type LoanTerms } from "./schedule.ts";

const month = (value: string) => isoMonthSchema.parse(value);
const day = (value: string) => isoDateSchema.parse(value);

const terms: LoanTerms = {
  firstEmiMonth: month("2026-08"),
  emiDay: 10,
  totalInstallments: 6,
  closedReason: null,
};

const paid = (emiMonth: string) => ({
  emiMonth: month(emiMonth),
  expenseId: 1,
  paidOn: day(`${emiMonth}-09`),
  amountPaise: 2_500_000,
  lateFeePaise: 0,
});

describe("buildSchedule", () => {
  it("lists each instalment with its due date and status as of today", () => {
    const schedule = buildSchedule(terms, [paid("2026-08")], day("2026-10-10"));

    expect(schedule.map((row) => [row.number, row.month, row.dueDate, row.status])).toEqual([
      [1, "2026-08", "2026-08-10", "PAID"],
      [2, "2026-09", "2026-09-10", "OVERDUE"],
      [3, "2026-10", "2026-10-10", "DUE_TODAY"],
      [4, "2026-11", "2026-11-10", "UPCOMING"],
      [5, "2026-12", "2026-12-10", "UPCOMING"],
      [6, "2027-01", "2027-01-10", "UPCOMING"],
    ]);
  });

  it("is overdue from the day after the due date", () => {
    const [first] = buildSchedule(terms, [], day("2026-08-11"));

    expect(first?.status).toBe("OVERDUE");
  });

  it("marks unpaid months closed after a foreclosure", () => {
    const schedule = buildSchedule(
      { ...terms, closedReason: "FORECLOSED" },
      [paid("2026-08")],
      day("2027-06-01"),
    );

    expect(schedule.map((row) => row.status)).toEqual([
      "PAID",
      "CLOSED",
      "CLOSED",
      "CLOSED",
      "CLOSED",
      "CLOSED",
    ]);
  });

  it("knows the last instalment month", () => {
    expect(lastEmiMonth(terms)).toBe("2027-01");
    expect(lastEmiMonth({ ...terms, totalInstallments: 1 })).toBe("2026-08");
  });
});

describe("summarise", () => {
  it("counts paid and overdue and finds the next one due", () => {
    const schedule = buildSchedule(terms, [paid("2026-08"), paid("2026-10")], day("2026-10-20"));

    expect(summarise(schedule)).toEqual({
      paidCount: 2,
      overdueCount: 1,
      nextDue: { month: "2026-09", dueDate: "2026-09-10" },
    });
  });

  it("has nothing next once every instalment is paid", () => {
    const all = ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12", "2027-01"].map(paid);

    expect(summarise(buildSchedule(terms, all, day("2027-02-01"))).nextDue).toBeNull();
  });
});
