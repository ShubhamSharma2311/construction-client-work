import { describe, expect, it } from "vitest";
import { netPaidText, shareStanding } from "./partnerText.ts";

describe("partner wording", () => {
  it.each([
    [1200000, "₹12,000 of Manish's share is still to pay"],
    [-300000, "Manish has been paid ₹3,000 more than the share"],
    [0, "Manish's share is paid exactly"],
  ])("words a share balance of %i paise", (balance, text) => {
    expect(shareStanding("Manish", balance)).toBe(text);
  });

  it("words net money moved either way", () => {
    expect(netPaidText("Manish", 500000)).toBe("Paid to Manish, net: ₹5,000");
    expect(netPaidText("Manish", -200000)).toBe("Received from Manish, net: ₹2,000");
  });
});
