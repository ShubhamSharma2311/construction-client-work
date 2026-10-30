import { describe, expect, it } from "vitest";
import { dueText } from "./emiText.ts";

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
