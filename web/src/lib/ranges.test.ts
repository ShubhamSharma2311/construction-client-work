import { describe, expect, it } from "vitest";
import { matchPreset, presetRange } from "./ranges.ts";

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
