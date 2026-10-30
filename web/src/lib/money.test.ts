import { describe, expect, it } from "vitest";
import { formatRupees, isRupeeInput } from "./money.ts";

describe("formatRupees", () => {
  it.each([
    [0, "₹0"],
    [350000, "₹3,500"],
    [12345600, "₹1,23,456"],
    [10000000000, "₹10,00,00,000"],
    [123450, "₹1,234.50"],
    [5, "₹0.05"],
    [-50000, "−₹500"],
    [-123401, "−₹1,234.01"],
  ])("shows %i paise as %s", (paise, text) => {
    expect(formatRupees(paise)).toBe(text);
  });
});

it("leaves the symbol out where the screen draws it separately", () => {
  expect(formatRupees(4825000, { symbol: false })).toBe("48,250");
  expect(formatRupees(-150, { symbol: false })).toBe("−1.50");
});

describe("isRupeeInput", () => {
  it.each(["", "0", "3500", "3500.", "3500.5", "3500.50", "1000000"])(
    "accepts %j while typing",
    (text) => {
      expect(isRupeeInput(text)).toBe(true);
    },
  );

  it.each(["-5", "1,000", "3500.505", "abc", "10000000", " 5", "1e5"])("refuses %j", (text) => {
    expect(isRupeeInput(text)).toBe(false);
  });
});
