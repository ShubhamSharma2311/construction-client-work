import { describe, expect, it } from "vitest";
import {
  checkTrip,
  emptyTrip,
  newTripBody,
  NO_PAYMENT,
  type PaymentValues,
  tripChanges,
  type TripValues,
} from "./tripForm.ts";

const filled: TripValues = {
  tripDate: "2026-10-28",
  customer: { id: 7, name: "Ramesh Bishnoi" },
  driverId: "2",
  tractorId: "3",
  khetId: "4",
  amount: "3500",
  quantityNote: "",
  notes: "",
};

describe("checking a trip before it is sent", () => {
  it("names every missing detail", () => {
    expect(Object.keys(checkTrip(emptyTrip("2026-10-28"), NO_PAYMENT))).toEqual([
      "customer",
      "driverId",
      "tractorId",
      "khetId",
      "amount",
    ]);
  });

  it.each([
    ["nothing paid now", "", "Enter how much was paid now"],
    ["the whole amount paid", "3500", "Paid now must be less than the trip amount"],
  ])("refuses a part payment with %s", (_label, paidAmount, message) => {
    const problems = checkTrip(filled, {
      type: "PARTIAL",
      paidAmount,
      mode: "CASH",
      reference: "",
    });

    expect(problems["paidAmount"]).toContain(message);
  });

  it("accepts a complete trip", () => {
    expect(
      checkTrip(filled, { type: "PARTIAL", paidAmount: "2000", mode: "ONLINE", reference: "" }),
    ).toEqual({});
  });
});

describe("the new trip as the API takes it", () => {
  it.each<[string, PaymentValues, unknown]>([
    ["cash", NO_PAYMENT, { type: "CASH" }],
    ["a due", { ...NO_PAYMENT, type: "DUE", reference: "ignored" }, { type: "DUE" }],
    [
      "online with a reference",
      { ...NO_PAYMENT, type: "ONLINE", reference: " UPI 4402 " },
      { type: "ONLINE", reference: "UPI 4402" },
    ],
    ["online without one", { ...NO_PAYMENT, type: "ONLINE" }, { type: "ONLINE" }],
    [
      "part paid in cash",
      { type: "PARTIAL", paidAmount: "2000", mode: "CASH", reference: "stale" },
      { type: "PARTIAL", paidAmount: "2000", mode: "CASH" },
    ],
    [
      "part paid online",
      { type: "PARTIAL", paidAmount: "2000", mode: "ONLINE", reference: "UTR9" },
      { type: "PARTIAL", paidAmount: "2000", mode: "ONLINE", reference: "UTR9" },
    ],
  ])("sends %s", (_label, payment, expected) => {
    expect(newTripBody(filled, payment).payment).toEqual(expected);
  });

  it("sends ids as numbers and leaves out empty notes", () => {
    expect(newTripBody({ ...filled, notes: "  ", quantityNote: "1 trolley " }, NO_PAYMENT)).toEqual(
      {
        tripDate: "2026-10-28",
        customerId: 7,
        driverId: 2,
        tractorId: 3,
        khetId: 4,
        amount: "3500",
        quantityNote: "1 trolley",
        payment: { type: "CASH" },
      },
    );
  });

  it("refuses to build a body with no customer", () => {
    expect(() => newTripBody({ ...filled, customer: null }, NO_PAYMENT)).toThrow(
      "needs a customer",
    );
  });
});

describe("an edit", () => {
  it("sends only what changed", () => {
    const after = { ...filled, amount: "4000", driverId: "5", notes: "late delivery" };

    expect(tripChanges(filled, after)).toEqual({
      amount: "4000",
      driverId: 5,
      notes: "late delivery",
    });
  });

  it("treats 3500 and 3500.00 as the same amount", () => {
    expect(tripChanges(filled, { ...filled, amount: "3500.00" })).toEqual({});
  });

  it("clears a note by sending it empty", () => {
    expect(tripChanges({ ...filled, notes: "old" }, filled)).toEqual({ notes: "" });
  });
});
