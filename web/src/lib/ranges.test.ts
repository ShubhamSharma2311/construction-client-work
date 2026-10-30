import { describe, expect, it } from "vitest";
import { businessDates, lastDays, matchPreset, presetRange } from "./ranges.ts";

describe("date range presets", () => {
  it.each([
    ["today", "2026-10-28", { from: "2026-10-28", to: "2026-10-28" }],
    ["week", "2026-10-28", { from: "2026-10-26", to: "2026-10-28" }],
    ["week", "2026-11-01", { from: "2026-10-26", to: "2026-11-01" }],
    ["week", "2026-10-26", { from: "2026-10-26", to: "2026-10-26" }],
    ["month", "2026-10-28", { from: "2026-10-01", to: "2026-10-28" }],
    ["lastMonth", "2026-03-15", { from: "2026-02-01", to: "2026-02-28" }],
    ["lastMonth", "2026-01-10", { from: "2025-12-01", to: "2025-12-31" }],
  ] as const)("%s on %s covers %j", (preset, today, range) => {
    expect(presetRange(preset, today)).toEqual(range);
  });

  it("has no bounds for all time", () => {
    expect(presetRange("all", "2026-10-28")).toBeNull();
  });

  it("recognises a preset from its dates, and nothing for a custom range", () => {
    expect(matchPreset({ from: "2026-10-01", to: "2026-10-28" }, "2026-10-28")).toBe("month");
    expect(matchPreset(null, "2026-10-28")).toBe("all");
    expect(matchPreset({ from: "2026-10-03", to: "2026-10-09" }, "2026-10-28")).toBeNull();
  });
});

describe("business dates", () => {
  it.each([
    [
      "a range inside the business stays as it is",
      { from: "2026-10-01", to: "2026-10-28" },
      { from: "2026-10-01", to: "2026-10-28" },
    ],
    ["all time runs from the start to today", null, { from: "2026-04-01", to: "2026-10-28" }],
    [
      "a range that began earlier starts on the first day",
      { from: "2026-03-01", to: "2026-04-30" },
      { from: "2026-04-01", to: "2026-04-30" },
    ],
    [
      "a range wholly before the start has no dates",
      { from: "2026-03-01", to: "2026-03-31" },
      null,
    ],
    [
      "a range running past today stops today",
      { from: "2026-10-01", to: "2026-12-31" },
      { from: "2026-10-01", to: "2026-10-28" },
    ],
    ["a range wholly after today has no dates", { from: "2026-11-01", to: "2026-11-30" }, null],
  ] as const)("%s", (_, range, expected) => {
    expect(businessDates(range, "2026-04-01", "2026-10-28")).toEqual(expected);
  });
});

describe("last days of a range", () => {
  it("keeps a short range whole", () => {
    expect(lastDays({ from: "2026-10-01", to: "2026-10-28" }, 366)).toEqual({
      from: "2026-10-01",
      to: "2026-10-28",
    });
  });

  it("keeps only the last days of a long one, counting both ends", () => {
    expect(lastDays({ from: "2025-01-01", to: "2026-10-28" }, 366)).toEqual({
      from: "2025-10-28",
      to: "2026-10-28",
    });
  });
});
