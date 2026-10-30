import { describe, expect, it } from "vitest";
import {
  checkExpense,
  emptyExpense,
  expenseBody,
  expenseChanges,
  ratePerLitre,
} from "./expenseValues.ts";

const day = "2026-10-28";

describe("checking an expense", () => {
  it.each([
    ["LABOUR", { amount: "500" }, ["labourerId"]],
    ["POLICE", { amount: "1000" }, ["notes"]],
    ["TRACTOR_SERVICE", { amount: "2500" }, ["notes", "tractorId"]],
    ["DIESEL", { amount: "4500" }, ["tractorId", "driverId", "litres"]],
    ["ROYALTY", { amount: "15000" }, []],
  ] as const)("asks %s for what it needs", (category, filled, missing) => {
    expect(Object.keys(checkExpense({ ...emptyExpense(category, day), ...filled }))).toEqual(
      missing,
    );
  });

  it("refuses more than 500 litres in one fill", () => {
    const values = {
      ...emptyExpense("DIESEL", day),
      amount: "60000",
      tractorId: "3",
      driverId: "2",
      litres: "600",
    };

    expect(checkExpense(values)["litres"]).toBe("A fill is at most 500 litres");
  });

  it.each([
    [{ periodFrom: "2026-10-01" }, "both dates"],
    [{ periodFrom: "2026-10-20", periodTo: "2026-10-01" }, "end after it starts"],
    [{ periodFrom: "2026-10-01", periodTo: "2026-10-31" }, "after the payment date"],
  ])("checks a royalty period %j", (period, message) => {
    const values = { ...emptyExpense("ROYALTY", day), amount: "15000", ...period };

    expect(checkExpense(values)["periodTo"]).toContain(message);
  });
});

describe("the expense as the API takes it", () => {
  it("sends diesel with its tractor, driver and litres", () => {
    const values = {
      ...emptyExpense("DIESEL", day),
      amount: "4500",
      tractorId: "3",
      driverId: "2",
      litres: "47.5",
    };

    expect(expenseBody(values)).toEqual({
      category: "DIESEL",
      spentOn: day,
      amount: "4500",
      mode: "CASH",
      tractorId: 3,
      driverId: 2,
      litres: "47.5",
    });
  });

  it("leaves out an emergency's tractor and driver when not given", () => {
    const values = { ...emptyExpense("EMERGENCY", day), amount: "800", notes: " Puncture " };

    expect(expenseBody(values)).toEqual({
      category: "EMERGENCY",
      spentOn: day,
      amount: "800",
      mode: "CASH",
      notes: "Puncture",
    });
  });

  it("sends a royalty period only when both dates are given", () => {
    const values = {
      ...emptyExpense("ROYALTY", day),
      amount: "15000",
      reference: "R-118",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-15",
    };

    expect(expenseBody(values)).toMatchObject({
      reference: "R-118",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-15",
    });
    expect(expenseBody({ ...values, periodFrom: "", periodTo: "" })).not.toHaveProperty(
      "periodFrom",
    );
  });

  it("sends a service's hour meter as a number", () => {
    const values = {
      ...emptyExpense("TRACTOR_SERVICE", day),
      amount: "2500",
      tractorId: "3",
      notes: "Oil change",
      hourMeter: "1450",
    };

    expect(expenseBody(values)).toMatchObject({
      tractorId: 3,
      notes: "Oil change",
      hourMeter: 1450,
    });
  });
});

describe("an expense edit", () => {
  it("sends only what changed", () => {
    const before = {
      ...emptyExpense("DIESEL", day),
      amount: "4500",
      tractorId: "3",
      driverId: "2",
      litres: "47.5",
    };

    expect(expenseChanges(before, { ...before, litres: "47.50", amount: "4600" })).toEqual({
      amount: "4600",
    });
  });
});

describe("price of diesel", () => {
  it("works out the rate per litre", () => {
    expect(ratePerLitre("4500", "47.5")).toBe("₹94.74 a litre");
    expect(ratePerLitre("", "47.5")).toBeNull();
  });
});
