import { describe, expect, it } from "vitest";
import { formatDayLabel } from "./dates.ts";

describe("formatDayLabel", () => {
  it.each([
    ["2026-10-28T06:30:00Z", "Wed, 28 Oct"],
    ["2026-10-28T18:29:59Z", "Wed, 28 Oct"],
    ["2026-10-28T18:30:00Z", "Thu, 29 Oct"],
  ])("shows %s as the Indian business day %s", (at, label) => {
    expect(formatDayLabel(new Date(at))).toBe(label);
  });
});
