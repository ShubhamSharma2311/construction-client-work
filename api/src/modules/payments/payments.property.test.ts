import fc from "fast-check";
import type { LightMyRequestResponse } from "fastify";
import { describe, expect, it } from "vitest";
import { useTestApp } from "../../../test/app.ts";
import { resetDb } from "../../../test/db.ts";
import { makeCustomer, makeTripMasters, type TripMasters } from "../../../test/factories.ts";
import { assertLedgerInvariants } from "../../../test/invariants.ts";
import { customerBalance, type CustomerBalance } from "../customer-ledger/balance.ts";
import type { Dues, Ledger } from "../customer-ledger/ledger.schema.ts";
import type { TripDeleted, TripSaved } from "../trips/trips.schema.ts";
import type { PaymentSaved } from "./payments.schema.ts";

const t = useTestApp();

const day = fc.integer({ min: 1, max: 28 }).map((d) => `2026-10-${String(d).padStart(2, "0")}`);
const customer = fc.nat(1);

/** One thing the owner might do. Indexes pick among the rows that exist at that moment. */
const operation = fc.oneof(
  fc.record({
    op: fc.constant("trip" as const),
    customer,
    day,
    amount: fc.integer({ min: 1, max: 5000 }),
    payment: fc.constantFrom("DUE", "CASH", "PARTIAL"),
  }),
  fc.record({
    op: fc.constant("opening" as const),
    customer,
    amount: fc.integer({ min: 1, max: 3000 }),
  }),
  fc.record({
    op: fc.constant("pay" as const),
    customer,
    day,
    amount: fc.integer({ min: 1, max: 6000 }),
    manual: fc.boolean(),
  }),
  fc.record({
    op: fc.constant("writeOff" as const),
    customer,
    day,
    amount: fc.integer({ min: 1, max: 500 }),
  }),
  fc.record({ op: fc.constant("reverse" as const), index: fc.nat(30) }),
  fc.record({ op: fc.constant("deleteTrip" as const), index: fc.nat(30), release: fc.boolean() }),
  // Weighted up: applying credit only matters when credit and a due exist together.
  { arbitrary: fc.record({ op: fc.constant("applyCredit" as const), customer }), weight: 3 },
  fc.record({
    op: fc.constant("editAmount" as const),
    index: fc.nat(30),
    amount: fc.integer({ min: 1, max: 5000 }),
  }),
);
type Operation = typeof operation extends fc.Arbitrary<infer Action> ? Action : never;

/** What each customer should owe, kept from successful responses alone. */
class Model {
  readonly owed = new Map<number, number>();

  add(customerId: number, paise: number): void {
    this.owed.set(customerId, (this.owed.get(customerId) ?? 0) + paise);
  }

  expectResponse(response: LightMyRequestResponse, customerId: number): void {
    const balance = response.json<{ customerBalance?: CustomerBalance }>().customerBalance;
    if (balance) {
      expect(balance.balancePaise, "balance in the response").toBe(this.owed.get(customerId) ?? 0);
    }
  }
}

interface World {
  masters: TripMasters[];
  model: Model;
}

async function freshWorld(): Promise<World> {
  await resetDb(t.db);
  await t.db.user.create({ data: { id: t.ownerId, username: "owner", passwordHash: "x" } });
  const first = await makeTripMasters(t);
  const second = { ...first, customer: await makeCustomer(t) };
  return { masters: [first, second], model: new Model() };
}

function customerOf(world: World, index: number): TripMasters {
  const masters = world.masters[index] ?? world.masters[0];
  if (!masters) throw new Error("world has no masters");
  return masters;
}

async function nth<T extends { id: number }>(
  rows: Promise<T[]>,
  index: number,
): Promise<T | undefined> {
  const list = await rows;
  return list[index % Math.max(list.length, 1)];
}

/**
 * Oldest-first order computed here, independently of the service: the register due first,
 * then by date, then by entry order.
 */
async function expectedFifo(customerId: number, amountPaise: number): Promise<[number, number][]> {
  const open = (await t.db.trip.findMany({ where: { customerId, deletedAt: null } }))
    .filter((trip) => trip.receivedPaise < trip.amountPaise)
    .sort(
      (a, b) =>
        Number(b.kind === "OPENING_BALANCE") - Number(a.kind === "OPENING_BALANCE") ||
        a.tripDate.getTime() - b.tripDate.getTime() ||
        a.id - b.id,
    );
  const lines: [number, number][] = [];
  let left = amountPaise;
  for (const trip of open) {
    const take = Math.min(left, trip.amountPaise - trip.receivedPaise);
    if (take > 0) lines.push([trip.id, take]);
    left -= take;
  }
  return lines;
}

async function perform(world: World, action: Operation): Promise<LightMyRequestResponse> {
  const { model } = world;
  switch (action.op) {
    case "trip": {
      const m = customerOf(world, action.customer);
      const payment =
        action.payment === "PARTIAL"
          ? action.amount > 1
            ? { type: "PARTIAL", paidAmount: Math.floor(action.amount / 2), mode: "CASH" }
            : { type: "DUE" }
          : { type: action.payment };
      const response = await t.post("/trips", {
        tripDate: action.day,
        customerId: m.customer.id,
        driverId: m.driver.id,
        tractorId: m.tractor.id,
        khetId: m.khet.id,
        amount: action.amount,
        payment,
      });
      if (response.statusCode === 201) {
        const { trip } = response.json<TripSaved>();
        model.add(m.customer.id, trip.amountPaise - trip.receivedPaise);
        model.expectResponse(response, m.customer.id);
      }
      return response;
    }
    case "opening": {
      const customerId = customerOf(world, action.customer).customer.id;
      const response = await t.post(`/customers/${String(customerId)}/opening-balance`, {
        amount: action.amount,
      });
      if (response.statusCode === 201) {
        model.add(customerId, action.amount * 100);
        model.expectResponse(response, customerId);
      }
      return response;
    }
    case "pay": {
      const customerId = customerOf(world, action.customer).customer.id;
      const firstOpen = (await expectedFifo(customerId, Number.MAX_SAFE_INTEGER))[0];
      const manual = action.manual ? firstOpen : undefined;
      const fifo = await expectedFifo(customerId, action.amount * 100);
      const response = await t.post(`/customers/${String(customerId)}/payments`, {
        kind: "PAYMENT",
        paidOn: action.day,
        mode: "CASH",
        amount: action.amount,
        allocation: manual
          ? {
              strategy: "MANUAL",
              items: [{ tripId: manual[0], amount: Math.min(action.amount, manual[1] / 100) }],
            }
          : { strategy: "AUTO" },
      });
      if (response.statusCode === 201) {
        const saved = response.json<PaymentSaved>();
        if (!manual) {
          const actual = saved.payment.allocations.map((line) => [line.tripId, line.amountPaise]);
          expect(actual, "automatic allocation pays oldest dues first").toEqual(fifo);
        }
        model.add(customerId, -action.amount * 100);
        model.expectResponse(response, customerId);
      }
      return response;
    }
    case "writeOff": {
      const customerId = customerOf(world, action.customer).customer.id;
      const owedBefore = model.owed.get(customerId) ?? 0;
      const response = await t.post(`/customers/${String(customerId)}/payments`, {
        kind: "WRITE_OFF",
        paidOn: action.day,
        amount: action.amount,
      });
      expect(response.statusCode === 201, "write-off accepted exactly when it is owed").toBe(
        action.amount * 100 <= owedBefore,
      );
      if (response.statusCode === 201) {
        model.add(customerId, -action.amount * 100);
        model.expectResponse(response, customerId);
      }
      return response;
    }
    case "reverse": {
      const payment = await nth(
        t.db.customerPayment.findMany({ orderBy: { id: "asc" } }),
        action.index,
      );
      const response = await t.delete(`/payments/${String(payment?.id ?? 0)}`);
      if (response.statusCode === 200 && payment) {
        model.add(payment.customerId, payment.amountPaise);
        model.expectResponse(response, payment.customerId);
      }
      return response;
    }
    case "deleteTrip": {
      const trip = await nth(t.db.trip.findMany({ orderBy: { id: "asc" } }), action.index);
      const response = await t.delete(
        `/trips/${String(trip?.id ?? 0)}?releasePayments=${String(action.release)}`,
      );
      if (response.statusCode === 200 && trip) {
        model.add(trip.customerId, -response.json<TripDeleted>().trip.amountPaise);
        model.expectResponse(response, trip.customerId);
      }
      return response;
    }
    case "applyCredit": {
      const customerId = customerOf(world, action.customer).customer.id;
      const response = await t.post(`/customers/${String(customerId)}/apply-credit`);
      if (response.statusCode === 200) {
        model.expectResponse(response, customerId);
        const after = response.json<{ customerBalance: CustomerBalance }>().customerBalance;
        expect(Math.min(after.duePaise, after.creditPaise), "credit left beside a due").toBe(0);
      }
      return response;
    }
    case "editAmount": {
      const trip = await nth(t.db.trip.findMany({ orderBy: { id: "asc" } }), action.index);
      const response = await t.patch(`/trips/${String(trip?.id ?? 0)}`, { amount: action.amount });
      if (response.statusCode === 200 && trip) {
        model.add(trip.customerId, action.amount * 100 - trip.amountPaise);
        model.expectResponse(response, trip.customerId);
      }
      return response;
    }
  }
}

/** Every view of the money must agree with the model. */
async function expectAllViewsAgree(world: World): Promise<void> {
  await assertLedgerInvariants(t.db);
  const dues = (await t.get("/dues")).json<Dues>();
  for (const { customer: c } of world.masters) {
    const owed = world.model.owed.get(c.id) ?? 0;
    expect((await customerBalance(t.db, c.id)).balancePaise, "stored balance").toBe(owed);
    const ledger = (await t.get(`/customers/${String(c.id)}/ledger`)).json<Ledger>();
    expect(ledger.closingBalancePaise, "ledger closing balance").toBe(owed);
    const listed = dues.customers.find((row) => row.customer.id === c.id)?.balancePaise;
    expect(listed, "dues list").toBe(owed > 0 ? owed : undefined);
  }
}

describe("ledger invariants under random use", () => {
  it("never loses or double-counts money, whatever the owner does", async () => {
    let successes = 0;
    let operations = 0;
    await fc.assert(
      fc.asyncProperty(fc.array(operation, { minLength: 1, maxLength: 16 }), async (actions) => {
        const world = await freshWorld();
        for (const action of actions) {
          const response = await perform(world, action);
          operations += 1;
          if (response.statusCode < 300) successes += 1;
          expect(response.statusCode, JSON.stringify(action)).toBeLessThan(500);
          await assertLedgerInvariants(t.db);
        }
        await expectAllViewsAgree(world);
      }),
      { numRuns: 30 },
    );
    // Guards against a vacuous run where every action was refused.
    expect(successes / operations).toBeGreaterThan(0.4);
  }, 300_000);
});
