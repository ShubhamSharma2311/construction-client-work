import { describe, expect, it } from "vitest";
import {
  centilitres,
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

describe("clearing on an edit", () => {
  it("removes an emergency's tractor and driver with null", () => {
    const before = {
      ...emptyExpense("EMERGENCY", day),
      amount: "800",
      notes: "Puncture",
      tractorId: "3",
      driverId: "2",
    };

    expect(expenseChanges(before, { ...before, tractorId: "", driverId: "" })).toEqual({
      tractorId: null,
      driverId: null,
    });
  });

  it("removes a royalty's period and a service's hour meter with null", () => {
    const royalty = {
      ...emptyExpense("ROYALTY", day),
      amount: "15000",
      periodFrom: "2026-10-01",
      periodTo: "2026-10-15",
    };
    const service = {
      ...emptyExpense("TRACTOR_SERVICE", day),
      amount: "2500",
      tractorId: "3",
      notes: "Oil",
      hourMeter: "1450",
    };

    expect(expenseChanges(royalty, { ...royalty, periodFrom: "", periodTo: "" })).toEqual({
      periodFrom: null,
      periodTo: null,
    });
    expect(expenseChanges(service, { ...service, hourMeter: "" })).toEqual({ hourMeter: null });
  });

  it("removes the reference when online money becomes cash", () => {
    const before = {
      ...emptyExpense("OTHER", day),
      amount: "500",
      notes: "Rope",
      mode: "ONLINE" as const,
      reference: "UPI123",
    };

    expect(expenseChanges(before, { ...before, mode: "CASH" })).toEqual({
      mode: "CASH",
      reference: null,
    });
  });
});

describe("the reference field", () => {
  it("is not sent once its field is hidden", () => {
    const police = {
      ...emptyExpense("POLICE", day),
      amount: "1000",
      notes: "Checkpost",
      reference: "R-12",
    };

    expect(expenseBody(police)).not.toHaveProperty("reference");
    expect(expenseBody({ ...police, mode: "ONLINE" })).toMatchObject({ reference: "R-12" });
  });
});

describe("litres", () => {
  it.each([
    ["45", 4500],
    ["45.", 4500],
    [".5", 50],
    ["47.25", 4725],
  ])("reads %j as %i hundredths", (text, centi) => {
    expect(centilitres(text)).toBe(centi);
  });

  it("has none for an empty field", () => {
    expect(centilitres("")).toBeNull();
    expect(centilitres(".")).toBeNull();
  });

  it("sends litres the API can read", () => {
    const diesel = {
      ...emptyExpense("DIESEL", day),
      amount: "4500",
      tractorId: "3",
      driverId: "2",
      litres: "45.",
    };

    expect(expenseBody(diesel)).toMatchObject({ litres: "45" });
    expect(expenseBody({ ...diesel, litres: ".5" })).toMatchObject({ litres: "0.5" });
  });
});
