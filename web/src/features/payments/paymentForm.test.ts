import { describe, expect, it } from "vitest";
import { TRIP } from "../../test/fixtures.ts";
import { checkPayment, type PaymentFormValues, paymentBody, shareOver } from "./paymentForm.ts";

const old = { ...TRIP, id: 1, duePaise: 150000 };
const mid = { ...TRIP, id: 2, duePaise: 300000 };
const recent = { ...TRIP, id: 3, duePaise: 350000 };
const unpaid = [old, mid, recent];

const values: PaymentFormValues = {
  customer: { id: 7, name: "Ramesh Bishnoi" },
  kind: "PAYMENT",
  paidOn: "2026-10-28",
  amount: "5000",
  mode: "CASH",
  reference: "",
  notes: "",
  allocation: "AUTO",
  chosen: [],
};

describe("sharing a payment over ticked trips", () => {
  it("pays each in the order ticked, until the money runs out", () => {
    const { shares, leftPaise } = shareOver(500000, [3, 1, 2], unpaid);

    expect(shares.map((share) => [share.trip.id, share.paise])).toEqual([
      [3, 350000],
      [1, 150000],
    ]);
    expect(leftPaise).toBe(0);
  });

  it("keeps what is over as credit", () => {
    expect(shareOver(200000, [1], unpaid).leftPaise).toBe(50000);
  });

  it("ignores a ticked trip that is no longer unpaid", () => {
    expect(shareOver(100000, [99, 1], unpaid).shares.map((share) => share.trip.id)).toEqual([1]);
  });
});

describe("checking a payment", () => {
  it("needs the customer, the amount, and trips when choosing them", () => {
    const problems = checkPayment(
      { ...values, customer: null, amount: "", allocation: "MANUAL" },
      unpaid,
    );

    expect(Object.keys(problems)).toEqual(["customer", "amount", "allocation"]);
  });

  it("needs chosen trips to owe all of a write-off, since forgiven money is not credit", () => {
    const writeOff = {
      ...values,
      kind: "WRITE_OFF" as const,
      notes: "Discount",
      amount: "2000",
      allocation: "MANUAL" as const,
    };

    expect(checkPayment({ ...writeOff, chosen: [1] }, unpaid)["allocation"]).toContain(
      "at least the discount",
    );
    expect(checkPayment({ ...writeOff, chosen: [1, 2] }, unpaid)).toEqual({});
  });

  it("needs a reason for a write-off", () => {
    expect(checkPayment({ ...values, kind: "WRITE_OFF" }, unpaid)["notes"]).toContain("why");
  });
});

describe("the payment as the API takes it", () => {
  it("pays the oldest dues first unless trips are chosen", () => {
    expect(paymentBody(values, unpaid)).toEqual({
      kind: "PAYMENT",
      mode: "CASH",
      paidOn: "2026-10-28",
      amount: "5000",
      allocation: { strategy: "AUTO" },
    });
  });

  it("names each chosen trip with its share, in rupees", () => {
    const body = paymentBody(
      { ...values, amount: "2000.50", allocation: "MANUAL", chosen: [1, 2] },
      unpaid,
    );

    expect(body.allocation).toEqual({
      strategy: "MANUAL",
      items: [
        { tripId: 1, amount: "1500" },
        { tripId: 2, amount: "500.50" },
      ],
    });
  });

  it("sends a reference only for online money", () => {
    expect(paymentBody({ ...values, mode: "ONLINE", reference: " UTR 88 " }, unpaid)).toMatchObject(
      { reference: "UTR 88" },
    );
    expect(paymentBody({ ...values, reference: "stale" }, unpaid)).not.toHaveProperty("reference");
  });

  it("sends a write-off with no mode", () => {
    const body = paymentBody({ ...values, kind: "WRITE_OFF", notes: "Discount agreed" }, unpaid);

    expect(body).toEqual({
      kind: "WRITE_OFF",
      paidOn: "2026-10-28",
      amount: "5000",
      notes: "Discount agreed",
      allocation: { strategy: "AUTO" },
    });
  });
});
