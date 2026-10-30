import { describe, expect, it } from "vitest";
import { netPaidText, shareStanding } from "./partnerText.ts";

describe("partner wording", () => {
  it.each([
    [1200000, "₹12,000 of Manish's share is still to pay"],
    [-300000, "Manish owes ₹3,000 back to the business"],
    [0, "Manish's share is paid exactly"],
  ])("words a share balance of %i paise", (balance, text) => {
    expect(shareStanding("Manish", balance)).toBe(text);
  });

  it("words net money moved either way", () => {
    expect(netPaidText("Manish", 500000)).toBe("Paid to Manish, net: ₹5,000");
    expect(netPaidText("Manish", -200000)).toBe("Received from Manish, net: ₹2,000");
  });

  it("says when the net is over every entry, not just the dates on screen", () => {
    expect(netPaidText("Manish", 500000, { inAll: true })).toBe(
      "In all, paid to Manish, net: ₹5,000",
    );
    expect(netPaidText("Manish", -200000, { inAll: true })).toBe(
      "In all, received from Manish, net: ₹2,000",
    );
  });
});
