import { describe, expect, it } from "vitest";
import { isoDateSchema, isoMonthSchema } from "../../lib/dates.ts";
import { daysInMonth, lastDayOf, prorate, rateFor } from "./salary-calc.ts";

const month = (value: string) => isoMonthSchema.parse(value);
const day = (value: string) => isoDateSchema.parse(value);

describe("month lengths", () => {
  it.each([
    ["2026-01", 31, "2026-01-31"],
    ["2026-02", 28, "2026-02-28"],
    ["2028-02", 29, "2028-02-29"],
    ["2026-04", 30, "2026-04-30"],
    ["2026-12", 31, "2026-12-31"],
  ])("%s has %d days ending %s", (value, days, last) => {
    expect(daysInMonth(month(value))).toBe(days);
    expect(lastDayOf(month(value))).toBe(last);
  });
});

describe("rateFor", () => {
  const rates = [
    { effectiveFrom: month("2026-04"), monthlyPaise: 1_500_000 },
    { effectiveFrom: month("2026-09"), monthlyPaise: 1_600_000 },
  ];

  it.each([
    ["2026-03", null],
    ["2026-04", 1_500_000],
    ["2026-08", 1_500_000],
    ["2026-09", 1_600_000],
    ["2027-01", 1_600_000],
  ])("in %s the rate is %s", (value, expected) => {
    expect(rateFor(rates, month(value))).toBe(expected);
  });
});

describe("prorate", () => {
  const rate = 1_500_000;

  it("pays a whole month in full", () => {
    expect(prorate(rate, month("2026-10"), day("2026-04-01"), null)).toEqual({
      monthlyPaise: rate,
      daysInMonth: 31,
      daysWorked: 31,
      amountPaise: rate,
    });
  });

  it("pays by days from the joining date", () => {
    // Joined on the 16th of a 30-day month: 15 days.
    expect(prorate(rate, month("2026-04"), day("2026-04-16"), null)).toMatchObject({
      daysWorked: 15,
      amountPaise: 750_000,
    });
  });

  it("pays by days up to the leaving date, inclusive", () => {
    expect(prorate(rate, month("2026-10"), day("2026-04-01"), day("2026-10-10"))).toMatchObject({
      daysWorked: 10,
      amountPaise: Math.round((rate * 10) / 31),
    });
  });

  it("handles joining and leaving in the same month", () => {
    expect(prorate(rate, month("2026-02"), day("2026-02-10"), day("2026-02-19"))).toMatchObject({
      daysInMonth: 28,
      daysWorked: 10,
    });
  });

  it("is zero for a month before joining or after leaving", () => {
    expect(prorate(rate, month("2026-03"), day("2026-04-01"), null).amountPaise).toBe(0);
    expect(prorate(rate, month("2026-11"), day("2026-04-01"), day("2026-10-10")).amountPaise).toBe(
      0,
    );
  });
});
