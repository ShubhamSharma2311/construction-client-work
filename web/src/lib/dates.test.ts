import { describe, expect, it } from "vitest";
import {
  addDays,
  daysBetween,
  formatDate,
  formatDayLabel,
  formatFullDate,
  formatMonth,
  todayIso,
} from "./dates.ts";

describe("the business day in India", () => {
  it.each([
    ["2026-10-28T06:30:00Z", "Wed, 28 Oct", "2026-10-28"],
    ["2026-10-28T18:29:59Z", "Wed, 28 Oct", "2026-10-28"],
    ["2026-10-28T18:30:00Z", "Thu, 29 Oct", "2026-10-29"],
  ])("at %s is %s (%s)", (at, label, iso) => {
    expect(formatDayLabel(new Date(at))).toBe(label);
    expect(todayIso(new Date(at))).toBe(iso);
  });
});

describe("date labels", () => {
  it("leaves out the year for dates in the current year", () => {
    expect(formatDate("2026-04-01", "2026-10-28")).toBe("1 Apr");
    expect(formatDate("2025-12-31", "2026-10-28")).toBe("31 Dec 2025");
  });

  it("writes full dates and months", () => {
    expect(formatFullDate("2026-10-28")).toBe("Wed, 28 Oct 2026");
    expect(formatMonth("2026-02")).toBe("Feb 2026");
  });
});

describe("date arithmetic", () => {
  it("crosses month and year ends", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
  });

  it("counts whole days", () => {
    expect(daysBetween("2026-09-24", "2026-10-28")).toBe(34);
    expect(daysBetween("2026-10-28", "2026-10-28")).toBe(0);
  });
});
