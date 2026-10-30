import { describe, expect, it } from "vitest";
import { driverStanding } from "./driverStanding.ts";

describe("a driver's standing", () => {
  it.each([
    [1500000, "You owe Suresh ₹15,000", true],
    [-300000, "Suresh has ₹3,000 in advance", false],
    [0, "Suresh's account is settled", null],
  ])("reads a balance of %i paise", (balance, text, owesDriver) => {
    expect(driverStanding("Suresh", balance)).toEqual({ text, owesDriver });
  });
});
