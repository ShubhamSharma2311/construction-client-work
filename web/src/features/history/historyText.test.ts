import { describe, expect, it } from "vitest";
import { changeLines, formatMoment } from "./historyText.ts";

const trip = {
  id: 43,
  tripDate: "2026-10-12T00:00:00.000Z",
  amountPaise: 350000,
  customerId: 3,
  customer: { id: 3, name: "Ramesh" },
  notes: null,
  createdAt: "2026-10-12T10:56:08.249Z",
  updatedAt: "2026-10-12T10:56:08.249Z",
  allocations: [{ id: 1 }],
};

describe("what changed in an entry", () => {
  it("words each changed field, leaving out bookkeeping", () => {
    const after = {
      ...trip,
      tripDate: "2026-10-13T00:00:00.000Z",
      amountPaise: 300000,
      customerId: 7,
      customer: { id: 7, name: "Sunil" },
      notes: "Wrong day",
      updatedAt: "2026-10-14T09:00:00.000Z",
      allocations: [],
    };

    expect(changeLines("UPDATE", trip, after, "2026-10-28")).toEqual([
      "Trip date: 12 Oct → 13 Oct",
      "Amount: ₹3,500 → ₹3,000",
      "Customer: Ramesh → Sunil",
      "Notes: none → Wrong day",
    ]);
  });

  it("shows an id change only when no name comes with it", () => {
    expect(changeLines("UPDATE", { khetId: 1 }, { khetId: 4 }, "2026-10-28")).toEqual([
      "Khet: #1 → #4",
    ]);
  });

  it("words litres, yes or no, and code words", () => {
    expect(
      changeLines(
        "UPDATE",
        { dieselMl: 40000, isActive: true, mode: "CASH" },
        { dieselMl: 45500, isActive: false, mode: "ONLINE" },
        "2026-10-28",
      ),
    ).toEqual(["Diesel: 40 L → 45.5 L", "In use: yes → no", "Mode: cash → online"]);
  });

  it("gives the amount of an entry added or deleted", () => {
    expect(changeLines("CREATE", null, trip, "2026-10-28")).toEqual(["Amount: ₹3,500"]);
    expect(changeLines("DELETE", trip, null, "2026-10-28")).toEqual(["Amount: ₹3,500"]);
    expect(changeLines("DELETE", { name: "Didwana" }, null, "2026-10-28")).toEqual([]);
  });

  it("says when an edit was saved with nothing changed", () => {
    expect(
      changeLines("UPDATE", trip, { ...trip, updatedAt: "2026-10-20T00:00:00.000Z" }, "2026-10-28"),
    ).toEqual(["Saved with no change"]);
  });

  it("copes with a record that is not an object", () => {
    expect(changeLines("UPDATE", "odd", 5, "2026-10-28")).toEqual([]);
  });
});

describe("when a change was made", () => {
  it("gives the day and time in India", () => {
    expect(formatMoment("2026-10-28T10:56:08.249Z", "2026-10-28")).toBe("28 Oct, 4:26 pm");
    expect(formatMoment("2025-12-31T19:00:00.000Z", "2026-10-28")).toBe("1 Jan, 12:30 am");
  });
});
