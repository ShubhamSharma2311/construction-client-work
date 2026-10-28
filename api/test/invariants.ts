import { expect } from "vitest";
import type { Db } from "../src/lib/prisma.ts";
import { customerBalance } from "../src/modules/customer-ledger/balance.ts";

/**
 * The money rules that must hold after any sequence of operations, checked straight
 * from the tables. A failure names the row that broke the rule.
 */
export async function assertLedgerInvariants(db: Db): Promise<void> {
  const [trips, payments, allocations, customers] = await Promise.all([
    db.trip.findMany(),
    db.customerPayment.findMany(),
    db.paymentAllocation.findMany(),
    db.customer.findMany({ select: { id: true } }),
  ]);

  const byTrip = new Map<number, number>();
  const byPayment = new Map<number, number>();
  for (const allocation of allocations) {
    byTrip.set(allocation.tripId, (byTrip.get(allocation.tripId) ?? 0) + allocation.amountPaise);
    byPayment.set(
      allocation.paymentId,
      (byPayment.get(allocation.paymentId) ?? 0) + allocation.amountPaise,
    );
  }

  for (const trip of trips) {
    const allocated = byTrip.get(trip.id) ?? 0;
    expect(trip.receivedPaise, `trip #${String(trip.id)} received`).toBe(allocated);
    expect(trip.receivedPaise, `trip #${String(trip.id)} within amount`).toBeLessThanOrEqual(
      trip.amountPaise,
    );
    if (trip.deletedAt) expect(allocated, `deleted trip #${String(trip.id)}`).toBe(0);
  }

  for (const payment of payments) {
    const allocated = byPayment.get(payment.id) ?? 0;
    expect(payment.allocatedPaise, `payment #${String(payment.id)} allocated`).toBe(allocated);
    expect(allocated, `payment #${String(payment.id)} within amount`).toBeLessThanOrEqual(
      payment.amountPaise,
    );
    if (payment.deletedAt) expect(allocated, `reversed payment #${String(payment.id)}`).toBe(0);
    if (payment.kind === "WRITE_OFF" && !payment.deletedAt) {
      expect(allocated, `write-off #${String(payment.id)} fully set`).toBe(payment.amountPaise);
    }
  }

  for (const { id } of customers) {
    const balance = await customerBalance(db, id);
    const billed = trips
      .filter((trip) => trip.customerId === id && !trip.deletedAt)
      .reduce((total, trip) => total + trip.amountPaise, 0);
    const paid = payments
      .filter((payment) => payment.customerId === id && !payment.deletedAt)
      .reduce((total, payment) => total + payment.amountPaise, 0);
    expect(balance.balancePaise, `customer #${String(id)} balance`).toBe(billed - paid);
    expect(balance.balancePaise, `customer #${String(id)} balance = due - credit`).toBe(
      balance.duePaise - balance.creditPaise,
    );
  }
}
