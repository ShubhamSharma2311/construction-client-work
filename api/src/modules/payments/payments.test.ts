import { beforeEach, describe, expect, it } from "vitest";
import { errorOf, useTestApp } from "../../../test/app.ts";
import {
  makeCustomer,
  makePayment,
  makeTrip,
  makeTripMasters,
  type TripMasters,
} from "../../../test/factories.ts";
import { assertLedgerInvariants } from "../../../test/invariants.ts";
import type { TripSaved } from "../trips/trips.schema.ts";
import type { CreditApplied, PaymentPage, PaymentSaved } from "./payments.schema.ts";

const t = useTestApp();
let m: TripMasters;

beforeEach(async () => {
  m = await makeTripMasters(t);
});

const paymentsUrl = (customerId = m.customer.id) => `/customers/${String(customerId)}/payments`;

function pay(body: Record<string, unknown>, customerId?: number) {
  return t.post(paymentsUrl(customerId), {
    kind: "PAYMENT",
    paidOn: "2026-10-25",
    mode: "CASH",
    ...body,
  });
}

async function trips(amounts: number[], dates?: string[]): Promise<TripSaved[]> {
  const saved: TripSaved[] = [];
  for (const [index, amount] of amounts.entries()) {
    saved.push(await makeTrip(t, m, { amount, tripDate: dates?.[index] ?? "2026-10-20" }));
  }
  return saved;
}

describe("clearing dues automatically (oldest first)", () => {
  it("pays the register due first, then trips by date", async () => {
    const [later, earlier] = await trips([3000, 2000], ["2026-10-22", "2026-10-10"]);
    const openingResponse = await t.post(`/customers/${String(m.customer.id)}/opening-balance`, {
      amount: 1000,
    });
    expect(openingResponse.statusCode, openingResponse.body).toBe(201);
    const opening = openingResponse.json<TripSaved>();

    const saved = (await pay({ amount: 4000 })).json<PaymentSaved>();

    expect(saved.payment.allocations.map((line) => [line.tripId, line.amountPaise])).toEqual([
      [opening.trip.id, 100_000],
      [earlier?.trip.id, 200_000],
      [later?.trip.id, 100_000],
    ]);
    expect(saved.payment).toMatchObject({ allocatedPaise: 400_000, unallocatedPaise: 0 });
    expect(saved.customerBalance).toEqual({
      balancePaise: 200_000,
      duePaise: 200_000,
      creditPaise: 0,
    });
    await assertLedgerInvariants(t.db);
  });

  it("keeps an overpayment as credit", async () => {
    await trips([1000]);

    const saved = (await pay({ amount: 1500 })).json<PaymentSaved>();

    expect(saved.payment.unallocatedPaise).toBe(50_000);
    expect(saved.customerBalance).toEqual({
      balancePaise: -50_000,
      duePaise: 0,
      creditPaise: 50_000,
    });
  });

  it("records an advance from a customer with nothing due", async () => {
    const saved = (
      await pay({ amount: 5000, mode: "ONLINE", reference: "UPI-1" })
    ).json<PaymentSaved>();

    expect(saved.payment.allocations).toEqual([]);
    expect(saved.customerBalance.creditPaise).toBe(500_000);
  });
});

describe("clearing chosen trips (manual)", () => {
  it("settles exactly the trips the owner picks", async () => {
    const [first, second] = await trips([1000, 2000]);

    const saved = (
      await pay({
        amount: 2500,
        allocation: { strategy: "MANUAL", items: [{ tripId: second?.trip.id, amount: 2000 }] },
      })
    ).json<PaymentSaved>();

    expect(saved.payment.allocations.map((line) => line.tripId)).toEqual([second?.trip.id]);
    expect(saved.payment.unallocatedPaise).toBe(50_000);
    expect((await t.get(`/trips/${String(first?.trip.id)}`)).json()).toMatchObject({
      status: "DUE",
    });
  });

  it("refuses another customer's trip, a deleted trip and more than a trip owes", async () => {
    const [own, removed] = await trips([1000, 1000]);
    await t.delete(`/trips/${String(removed?.trip.id)}`);
    const other = await makeCustomer(t);
    const theirs = await makeTrip(t, { ...m, customer: other });
    const manual = (tripId: number | undefined, amount: number) => ({
      amount: 5000,
      allocation: { strategy: "MANUAL", items: [{ tripId, amount }] },
    });

    expect((await pay(manual(theirs.trip.id, 100))).statusCode).toBe(409);
    expect((await pay(manual(removed?.trip.id, 100))).statusCode).toBe(409);
    const tooMuch = await pay(manual(own?.trip.id, 1001));
    expect(tooMuch.statusCode).toBe(409);
    expect(errorOf(tooMuch).details).toEqual({ tripId: own?.trip.id, duePaise: 100_000 });
    expect(await t.db.customerPayment.count()).toBe(0);
  });

  it("refuses a plan larger than the payment or naming a trip twice", async () => {
    const [first, second] = await trips([1000, 1000]);

    const larger = await pay({
      amount: 1500,
      allocation: {
        strategy: "MANUAL",
        items: [
          { tripId: first?.trip.id, amount: 1000 },
          { tripId: second?.trip.id, amount: 1000 },
        ],
      },
    });
    const twice = await pay({
      amount: 1500,
      allocation: {
        strategy: "MANUAL",
        items: [
          { tripId: first?.trip.id, amount: 100 },
          { tripId: first?.trip.id, amount: 100 },
        ],
      },
    });

    expect(larger.statusCode).toBe(400);
    expect(twice.statusCode).toBe(400);
  });
});

describe("write-offs", () => {
  it("forgives the remaining due without counting as money received", async () => {
    await trips([5000]);
    await pay({ amount: 4800 });

    const response = await t.post(paymentsUrl(), {
      kind: "WRITE_OFF",
      paidOn: "2026-10-25",
      amount: 200,
      notes: "discount at settlement",
    });

    const saved = response.json<PaymentSaved>();
    expect(saved.payment).toMatchObject({ kind: "WRITE_OFF", mode: null, allocatedPaise: 20_000 });
    expect(saved.customerBalance).toEqual({ balancePaise: 0, duePaise: 0, creditPaise: 0 });
    const list = (await t.get("/payments")).json<PaymentPage>();
    expect(list.totals).toEqual({ cashPaise: 480_000, onlinePaise: 0, writeOffPaise: 20_000 });
  });

  it("cannot forgive more than is due", async () => {
    await trips([1000]);

    const response = await t.post(paymentsUrl(), {
      kind: "WRITE_OFF",
      paidOn: "2026-10-25",
      amount: 1500,
    });

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).details).toEqual({ balancePaise: 100_000, creditPaise: 0 });
  });

  it("must be set in full when chosen by hand", async () => {
    const [trip] = await trips([1000]);

    const response = await t.post(paymentsUrl(), {
      kind: "WRITE_OFF",
      paidOn: "2026-10-25",
      amount: 500,
      allocation: { strategy: "MANUAL", items: [{ tripId: trip?.trip.id, amount: 300 }] },
    });

    expect(response.statusCode).toBe(400);
  });

  it.each([
    ["a mode", { mode: "CASH" }],
    ["a reference", { reference: "x" }],
  ])("refuses %s", async (_label, extra) => {
    await trips([1000]);

    const response = await t.post(paymentsUrl(), {
      kind: "WRITE_OFF",
      paidOn: "2026-10-25",
      amount: 100,
      ...extra,
    });

    expect(response.statusCode).toBe(400);
  });
});

describe("payment rules", () => {
  it.each([
    ["no mode", { mode: undefined }, 400],
    ["a future date", { paidOn: "2026-10-29" }, 400],
    ["a date before the business start", { paidOn: "2026-03-31" }, 400],
    ["zero amount", { amount: 0 }, 400],
  ])("refuses %s", async (_label, body, status) => {
    expect((await pay({ amount: 100, ...body })).statusCode).toBe(status);
  });

  it("404s an unknown customer but accepts money from an inactive one", async () => {
    await trips([1000]);
    await t.patch(`/customers/${String(m.customer.id)}`, { isActive: false });

    expect((await pay({ amount: 100 }, 99999)).statusCode).toBe(404);
    expect((await pay({ amount: 100 })).statusCode).toBe(201);
  });

  it("refuses a UPI reference already used, including one taken at delivery", async () => {
    await makeTrip(t, m, { payment: { type: "ONLINE", reference: "UPI-77" } });

    const response = await pay({ amount: 100, mode: "ONLINE", reference: "UPI-77" });

    expect(response.statusCode).toBe(409);
  });

  it("records one payment for a replayed request", async () => {
    await trips([1000]);
    const body = { kind: "PAYMENT", paidOn: "2026-10-25", mode: "CASH", amount: 500 };

    await t.post(paymentsUrl(), body, "pay-key-0001");
    const replay = await t.post(paymentsUrl(), body, "pay-key-0001");

    expect(replay.headers["idempotent-replay"]).toBe("true");
    expect(await t.db.customerPayment.count()).toBe(1);
  });

  it("never over-allocates when two payments for one customer arrive together", async () => {
    await trips([1000]);

    const results = await Promise.all([pay({ amount: 800 }), pay({ amount: 800 })]);

    expect(results.map((response) => response.statusCode)).toEqual([201, 201]);
    const trip = await t.db.trip.findFirstOrThrow();
    expect(trip.receivedPaise).toBe(100_000);
    await assertLedgerInvariants(t.db);
    expect((await t.get("/dues")).json()).toMatchObject({ customers: [] });
  });
});

describe("reversing a payment", () => {
  it("makes the trips due again and stops the payment counting", async () => {
    await trips([1000, 1000]);
    const saved = (await pay({ amount: 1500 })).json<PaymentSaved>();

    const response = await t.delete(`/payments/${String(saved.payment.id)}`);

    const reversed = response.json<PaymentSaved>();
    expect(reversed.payment.deletedAt).not.toBeNull();
    expect(reversed.payment.allocations).toEqual([]);
    expect(reversed.customerBalance).toEqual({
      balancePaise: 200_000,
      duePaise: 200_000,
      creditPaise: 0,
    });
    expect((await t.delete(`/payments/${String(saved.payment.id)}`)).statusCode).toBe(409);
    expect((await t.get("/payments?deleted=true")).json<PaymentPage>().total).toBe(1);
    await assertLedgerInvariants(t.db);
  });

  it("reverses a write-off and a payment taken at delivery", async () => {
    const delivered = await makeTrip(t, m, { amount: 1000, payment: { type: "CASH" } });
    const [due] = await trips([1000]);
    const writeOff = (
      await t.post(paymentsUrl(), { kind: "WRITE_OFF", paidOn: "2026-10-25", amount: 100 })
    ).json<PaymentSaved>();
    const atDelivery = await t.db.customerPayment.findFirstOrThrow({
      where: { deliveryTripId: delivered.trip.id },
    });

    await t.delete(`/payments/${String(writeOff.payment.id)}`);
    await t.delete(`/payments/${String(atDelivery.id)}`);

    expect((await t.get(`/trips/${String(delivered.trip.id)}`)).json()).toMatchObject({
      status: "DUE",
    });
    expect((await t.get(`/trips/${String(due?.trip.id)}`)).json()).toMatchObject({ status: "DUE" });
    await assertLedgerInvariants(t.db);
  });

  it("404s an unknown payment", async () => {
    expect((await t.delete("/payments/99999")).statusCode).toBe(404);
  });
});

describe("applying credit", () => {
  it("sets earlier unused money against new dues, oldest payment first", async () => {
    await makePayment(t, m.customer.id, { amount: 300, paidOn: "2026-10-01" });
    await makePayment(t, m.customer.id, { amount: 500, paidOn: "2026-10-02" });
    await trips([600]);

    const response = await t.post(`/customers/${String(m.customer.id)}/apply-credit`);

    const applied = response.json<CreditApplied>();
    expect(applied.allocations.map((line) => line.amountPaise)).toEqual([30_000, 30_000]);
    expect(applied.customerBalance).toEqual({
      balancePaise: -20_000,
      duePaise: 0,
      creditPaise: 20_000,
    });
    await assertLedgerInvariants(t.db);
  });

  it("does nothing when there is no credit or no due", async () => {
    await trips([600]);

    const response = await t.post(`/customers/${String(m.customer.id)}/apply-credit`);

    expect(response.json<CreditApplied>().allocations).toEqual([]);
  });

  it("uses credit released by deleting a paid trip", async () => {
    const paid = await makeTrip(t, m, { amount: 1000, payment: { type: "CASH" } });
    await t.delete(`/trips/${String(paid.trip.id)}?releasePayments=true`);
    await trips([700]);

    const applied = (
      await t.post(`/customers/${String(m.customer.id)}/apply-credit`)
    ).json<CreditApplied>();

    expect(applied.customerBalance).toEqual({
      balancePaise: -30_000,
      duePaise: 0,
      creditPaise: 30_000,
    });
  });
});

describe("correcting a payment", () => {
  it("changes mode, date, reference and notes, and audits it", async () => {
    await trips([1000]);
    const saved = (await pay({ amount: 1000 })).json<PaymentSaved>();
    const url = `/payments/${String(saved.payment.id)}`;

    const response = await t.patch(url, {
      mode: "ONLINE",
      paidOn: "2026-10-24",
      reference: "UPI-9",
      notes: "was online, not cash",
    });

    expect(response.json<PaymentSaved>().payment).toMatchObject({
      mode: "ONLINE",
      paidOn: "2026-10-24",
      reference: "UPI-9",
    });
    expect((await t.get("/payments")).json<PaymentPage>().totals.onlinePaise).toBe(100_000);
  });

  it("refuses to re-date money taken at delivery", async () => {
    const delivered = await makeTrip(t, m, { payment: { type: "CASH" } });
    const payment = await t.db.customerPayment.findFirstOrThrow({
      where: { deliveryTripId: delivered.trip.id },
    });

    const response = await t.patch(`/payments/${String(payment.id)}`, { paidOn: "2026-10-21" });

    expect(response.statusCode).toBe(409);
    expect((await t.patch(`/payments/${String(payment.id)}`, { mode: "ONLINE" })).statusCode).toBe(
      200,
    );
  });

  it("refuses a mode on a write-off, edits to a reversed payment, and a taken reference", async () => {
    await trips([1000]);
    const writeOff = (
      await t.post(paymentsUrl(), { kind: "WRITE_OFF", paidOn: "2026-10-25", amount: 100 })
    ).json<PaymentSaved>();
    await pay({ amount: 100, mode: "ONLINE", reference: "UPI-1" });
    const other = (await pay({ amount: 100 })).json<PaymentSaved>();

    expect(
      (await t.patch(`/payments/${String(writeOff.payment.id)}`, { mode: "CASH" })).statusCode,
    ).toBe(400);
    expect(
      (await t.patch(`/payments/${String(other.payment.id)}`, { reference: "UPI-1" })).statusCode,
    ).toBe(409);
    await t.delete(`/payments/${String(other.payment.id)}`);
    expect(
      (await t.patch(`/payments/${String(other.payment.id)}`, { notes: "x" })).statusCode,
    ).toBe(409);
  });
});

describe("listing and exporting payments", () => {
  it("filters by date, customer, mode and kind with totals", async () => {
    await trips([5000]);
    await pay({ amount: 1000, paidOn: "2026-10-01" });
    await pay({ amount: 2000, paidOn: "2026-10-10", mode: "ONLINE" });
    const other = await makeCustomer(t);
    await pay({ amount: 700, paidOn: "2026-10-10" }, other.id);

    const october10 = (await t.get("/payments?from=2026-10-10&to=2026-10-10")).json<PaymentPage>();
    const online = (await t.get("/payments?mode=ONLINE")).json<PaymentPage>();
    const forOther = (await t.get(`/payments?customerId=${String(other.id)}`)).json<PaymentPage>();

    expect(october10.totals).toEqual({ cashPaise: 70_000, onlinePaise: 200_000, writeOffPaise: 0 });
    expect(online.total).toBe(1);
    expect(forOther.items.map((payment) => payment.amountPaise)).toEqual([70_000]);
  });

  it("exports a CSV listing the trips each payment cleared", async () => {
    const [trip] = await trips([1000]);
    await pay({ amount: 1000 });

    const response = await t.get("/payments/export?from=2026-10-01&to=2026-10-31");

    expect(response.headers["content-disposition"]).toContain(
      "payments_2026-10-01_to_2026-10-31.csv",
    );
    expect(response.body).toContain(`#${String(trip?.trip.id)}`);
  });

  it("gets one payment and 404s an unknown one", async () => {
    const saved = await makePayment(t, m.customer.id);

    expect((await t.get(`/payments/${String(saved.payment.id)}`)).json()).toMatchObject({
      id: saved.payment.id,
    });
    expect((await t.get("/payments/99999")).statusCode).toBe(404);
  });
});

describe("effects on trips", () => {
  it("stops a trip's amount going below money received by a later payment", async () => {
    const [trip] = await trips([1000]);
    await pay({ amount: 600 });

    const response = await t.patch(`/trips/${String(trip?.trip.id)}`, { amount: 500 });

    expect(response.statusCode).toBe(409);
  });

  it("stops the business start moving past a payment", async () => {
    await pay({ amount: 100, paidOn: "2026-05-01" });

    const response = await t.put("/settings", {
      businessName: "Sawariya Seth Construction Materials",
      businessStartDate: "2026-06-01",
      openingCash: 0,
      openingOnline: 0,
    });

    expect(response.statusCode).toBe(409);
  });
});

describe("write-offs and unused credit", () => {
  it("refuses to write off a due the customer's unused credit already covers", async () => {
    await makePayment(t, m.customer.id, { amount: 1000 });
    await trips([1000]);

    const response = await t.post(paymentsUrl(), {
      kind: "WRITE_OFF",
      paidOn: "2026-10-25",
      amount: 1000,
    });

    expect(response.statusCode).toBe(409);
    expect(errorOf(response).message).toContain("apply");
  });

  it("allows a write-off of what is owed after credit", async () => {
    await makePayment(t, m.customer.id, { amount: 600 });
    await trips([1000]);

    const response = await t.post(paymentsUrl(), {
      kind: "WRITE_OFF",
      paidOn: "2026-10-25",
      amount: 400,
    });

    expect(response.statusCode).toBe(201);
  });
});
