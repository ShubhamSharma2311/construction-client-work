import { describe, expect, it } from "vitest";
import { checkLoan, EMPTY_LOAN, loanBody } from "./loanForm.ts";

const filled = {
  lender: " Mahindra Finance ",
  emiAmount: "18200",
  emiDay: "5",
  firstEmiMonth: "2026-04",
  totalInstallments: "36",
  notes: "",
};

describe("a new loan", () => {
  it("names every missing detail", () => {
    expect(Object.keys(checkLoan(EMPTY_LOAN))).toEqual([
      "lender",
      "emiAmount",
      "emiDay",
      "firstEmiMonth",
      "totalInstallments",
    ]);
  });

  it.each(["0", "29", "31", "x"])(
    "refuses an EMI day of %j, which not every month has",
    (emiDay) => {
      expect(checkLoan({ ...filled, emiDay })["emiDay"]).toBe("Pick a day from 1 to 28");
    },
  );

  it("sends numbers as numbers and a trimmed lender", () => {
    expect(checkLoan(filled)).toEqual({});
    expect(loanBody(filled)).toEqual({
      lender: "Mahindra Finance",
      emiAmount: "18200",
      emiDay: 5,
      firstEmiMonth: "2026-04",
      totalInstallments: 36,
    });
  });
});
