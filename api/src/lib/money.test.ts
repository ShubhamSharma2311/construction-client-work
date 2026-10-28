import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  formatPaise,
  MAX_ENTRY_PAISE,
  paiseToRupeeString,
  rupeesSchema,
  toPaise,
} from "./money.ts";

describe("toPaise", () => {
  it.each([
    [1500, 150000],
    ["1500", 150000],
    ["1500.5", 150050],
    ["1500.50", 150050],
    [19.99, 1999],
    [0.01, 1],
    ["  250 ", 25000],
    [1000000, MAX_ENTRY_PAISE],
  ])("converts %j to %d paise", (input, expected) => {
    expect(toPaise(input)).toEqual({ ok: true, paise: expected });
  });

  it.each([
    [0, "must be greater than zero"],
    ["0.00", "must be greater than zero"],
    [-5, "must be greater than zero"],
    ["-5", "must be greater than zero"],
    ["12.345", "at most 2 decimal places"],
    [12.345, "at most 2 decimal places"],
    ["1,000", "not a valid amount"],
    ["1e3", "not a valid amount"],
    [Number.NaN, "not a valid amount"],
    [Number.POSITIVE_INFINITY, "not a valid amount"],
    ["", "not a valid amount"],
    ["abc", "not a valid amount"],
    ["₹500", "not a valid amount"],
    [1000000.01, "cannot exceed"],
    [1e21, "not a valid amount"],
  ])("rejects %j", (input, reason) => {
    const result = toPaise(input);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain(reason);
  });

  it("round-trips every paise value through its rupee string", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: MAX_ENTRY_PAISE }), (paise) => {
        expect(toPaise(paiseToRupeeString(paise))).toEqual({ ok: true, paise });
      }),
    );
  });
});

describe("rupeesSchema", () => {
  it("parses rupees into paise", () => {
    expect(rupeesSchema.parse("4800.25")).toBe(480025);
  });

  it("reports the reason as a zod issue", () => {
    const result = rupeesSchema.safeParse("12.345");
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain("at most 2 decimal places");
  });
});

describe("formatting", () => {
  it("writes rupee strings with two decimals", () => {
    expect(paiseToRupeeString(150050)).toBe("1500.50");
    expect(paiseToRupeeString(1)).toBe("0.01");
    expect(paiseToRupeeString(-25000)).toBe("-250.00");
  });

  it("formats with Indian digit grouping", () => {
    expect(formatPaise(10000000)).toBe("₹1,00,000.00");
    expect(formatPaise(300000)).toBe("₹3,000.00");
  });
});
