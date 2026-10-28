import { beforeEach, describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import {
  makeCustomer,
  makePayment,
  makeTrip,
  makeTripMasters,
  type TripMasters,
} from "../../../test/factories.ts";
import type { Dues, Ledger } from "./ledger.schema.ts";
import { ageBucket } from "./ledger.service.ts";

const t = useTestApp();
let m: TripMasters;

beforeEach(async () => {
  m = await makeTripMasters(t);
});

const ledgerUrl = (query = "") => `/customers/${String(m.customer.id)}/ledger${query}`;

describe("customer ledger", () => {
  async function seed() {
    await t.post(`/customers/${String(m.customer.id)}/opening-balance`, { amount: 1000 });
    await makeTrip(t, m, { tripDate: "2026-10-01", amount: 5000 });
    await makePayment(t, m.customer.id, { paidOn: "2026-10-01", amount: 2000 });
    await makeTrip(t, m, { tripDate: "2026-10-10", amount: 3000, payment: { type: "CASH" } });
    await t.post(`/customers/${String(m.customer.id)}/payments`, {
      kind: "WRITE_OFF",
      paidOn: "2026-10-12",
      amount: 500,
    });
  }

  it("lists every line with a running balance", async () => {
    await seed();

    const ledger = (await t.get(ledgerUrl())).json<Ledger>();

    expect(
      ledger.entries.map((entry) => [
        entry.date,
        entry.type,
        entry.debitPaise,
        entry.creditPaise,
        entry.balancePaise,
      ]),
    ).toEqual([
      ["2026-04-01", "OPENING_BALANCE", 100_000, 0, 100_000],
      ["2026-10-01", "TRIP", 500_000, 0, 600_000],
      ["2026-10-01", "PAYMENT", 0, 200_000, 400_000],
      ["2026-10-10", "TRIP", 300_000, 0, 700_000],
      ["2026-10-10", "PAYMENT", 0, 300_000, 400_000],
      ["2026-10-12", "WRITE_OFF", 0, 50_000, 350_000],
    ]);
    expect(ledger).toMatchObject({
      openingBalancePaise: 0,
      closingBalancePaise: 350_000,
      totals: { debitPaise: 900_000, creditPaise: 550_000 },
    });
    expect(ledger.entries[1]?.description).toContain(m.khet.name);
  });

  it("starts a date range from the balance carried into it", async () => {
    await seed();

    const ledger = (await t.get(ledgerUrl("?from=2026-10-10&to=2026-10-10"))).json<Ledger>();

    expect(ledger.openingBalancePaise).toBe(400_000);
    expect(ledger.entries).toHaveLength(2);
    expect(ledger.closingBalancePaise).toBe(400_000);
  });

  it("leaves out deleted trips and reversed payments", async () => {
    const trip = await makeTrip(t, m, { amount: 1000 });
    const payment = await makePayment(t, m.customer.id, { amount: 300 });
    await t.delete(`/payments/${String(payment.payment.id)}`);
    await t.delete(`/trips/${String(trip.trip.id)}`);

    const ledger = (await t.get(ledgerUrl())).json<Ledger>();

    expect(ledger.entries).toEqual([]);
    expect(ledger.closingBalancePaise).toBe(0);
  });

  it("exports the statement as CSV and 404s an unknown customer", async () => {
    await seed();

    const csv = await t.get(ledgerUrl("/export?from=2026-10-01"));

    expect(csv.headers["content-disposition"]).toContain(
      `ledger_customer_${String(m.customer.id)}_2026-10-01.csv`,
    );
    expect(csv.body).toContain("2026-10-01,BROUGHT_FORWARD,,Balance brought forward");
    expect(csv.body).toContain("3500.00");
    expect((await t.get("/customers/99999/ledger")).statusCode).toBe(404);
  });
});

describe("dues list", () => {
  it("ages each customer by their oldest unpaid trip, largest balance first", async () => {
    const recent = await makeCustomer(t, { name: "Recent" });
    const old = await makeCustomer(t, { name: "Old" });
    const settled = await makeCustomer(t, { name: "Settled" });
    const inCredit = await makeCustomer(t, { name: "In credit" });
    await makeTrip(t, { ...m, customer: recent }, { tripDate: "2026-10-25", amount: 2000 });
    await makeTrip(t, { ...m, customer: old }, { tripDate: "2026-07-01", amount: 1000 });
    await makeTrip(t, { ...m, customer: old }, { tripDate: "2026-10-27", amount: 500 });
    await makeTrip(t, { ...m, customer: settled }, { payment: { type: "CASH" } });
    await makePayment(t, inCredit.id, { amount: 100 });

    const dues = (await t.get("/dues")).json<Dues>();

    expect(dues.asOf).toBe("2026-10-28");
    expect(
      dues.customers.map((row) => [
        row.customer.name,
        row.balancePaise,
        row.oldestDueDate,
        row.ageDays,
        row.bucket,
      ]),
    ).toEqual([
      ["Recent", 200_000, "2026-10-25", 3, "0-7"],
      ["Old", 150_000, "2026-07-01", 119, "90+"],
    ]);
    expect(dues.totals).toEqual({
      balancePaise: 350_000,
      byBucket: { "0-7": 200_000, "8-30": 0, "31-90": 0, "90+": 150_000 },
    });
  });

  it("flags a customer whose paid money is waiting to be applied", async () => {
    await makePayment(t, m.customer.id, { amount: 300 });
    await makeTrip(t, m, { amount: 1000 });

    const [row] = (await t.get("/dues")).json<Dues>().customers;

    expect(row).toMatchObject({
      balancePaise: 70_000,
      duePaise: 100_000,
      creditPaise: 30_000,
      hasUnappliedCredit: true,
    });
  });

  it("ages from the oldest trip still unpaid, not the oldest trip", async () => {
    await makeTrip(t, m, { tripDate: "2026-06-01", amount: 1000 });
    await makeTrip(t, m, { tripDate: "2026-10-20", amount: 1000 });
    await makePayment(t, m.customer.id, { amount: 1000 });

    const [row] = (await t.get("/dues")).json<Dues>().customers;

    expect(row?.oldestDueDate).toBe("2026-10-20");
  });

  it("exports the dues as CSV", async () => {
    await makeTrip(t, m, { amount: 1000 });

    const csv = await t.get("/dues/export");

    expect(csv.headers["content-disposition"]).toContain("dues_2026-10-28.csv");
    expect(csv.body).toContain(m.customer.name);
  });

  it.each([
    [0, "0-7"],
    [7, "0-7"],
    [8, "8-30"],
    [30, "8-30"],
    [31, "31-90"],
    [90, "31-90"],
    [91, "90+"],
  ] as const)("puts %d days in bucket %s", (days, bucket) => {
    expect(ageBucket(days)).toBe(bucket);
  });
});
