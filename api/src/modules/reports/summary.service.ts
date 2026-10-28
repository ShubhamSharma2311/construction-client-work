import { addDays, daysBetween, dayFilter, fromDbDate, type ClosedRange } from "../../lib/dates.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import type { DaySummary, Summary } from "./reports.schema.ts";

type DayTotals = Omit<DaySummary, "date">;

function emptyDay(): DayTotals {
  return {
    trips: 0,
    revenuePaise: 0,
    cashInPaise: 0,
    onlineInPaise: 0,
    newDuesPaise: 0,
    duesRecoveredPaise: 0,
    expensesPaise: 0,
    driverPaymentsPaise: 0,
    partnerNetPaidPaise: 0,
  };
}

/** Day-by-day activity: deliveries, money in, new and recovered dues, and money out. */
export async function dailySummary(tx: Db | Tx, range: ClosedRange): Promise<Summary> {
  const days = dayFilter(range);
  const [trips, payments, expenses, driverPayments, partnerTxns] = await Promise.all([
    tx.trip.findMany({ where: { kind: "TRIP", deletedAt: null, tripDate: days } }),
    tx.customerPayment.findMany({
      where: { kind: "PAYMENT", deletedAt: null, paidOn: days },
      include: { deliveryTrip: { select: { deletedAt: true } } },
    }),
    tx.expense.findMany({ where: { deletedAt: null, spentOn: days } }),
    tx.driverPayment.findMany({ where: { deletedAt: null, paidOn: days } }),
    tx.partnerTxn.findMany({ where: { deletedAt: null, txnDate: days } }),
  ]);

  const byDay = new Map<string, DayTotals>();
  for (let offset = 0; offset <= daysBetween(range.from, range.to); offset += 1) {
    byDay.set(addDays(range.from, offset), emptyDay());
  }
  const on = (date: Date): DayTotals => {
    const day = byDay.get(fromDbDate(date));
    if (!day) throw new Error(`Row dated ${fromDbDate(date)} fell outside the summary range`);
    return day;
  };

  for (const trip of trips) {
    const day = on(trip.tripDate);
    day.trips += 1;
    day.revenuePaise += trip.amountPaise;
    day.newDuesPaise += trip.amountPaise;
  }
  for (const payment of payments) {
    const day = on(payment.paidOn);
    if (payment.mode === "CASH") day.cashInPaise += payment.amountPaise;
    else day.onlineInPaise += payment.amountPaise;
    // Money taken at a live delivery never became a due. Money from a delivery that was
    // deleted and released is now customer credit: neither a new due nor a recovery.
    if (payment.deliveryTrip === null) day.duesRecoveredPaise += payment.amountPaise;
    else if (payment.deliveryTrip.deletedAt === null) day.newDuesPaise -= payment.amountPaise;
  }
  for (const expense of expenses) on(expense.spentOn).expensesPaise += expense.amountPaise;
  for (const payment of driverPayments)
    on(payment.paidOn).driverPaymentsPaise += payment.amountPaise;
  for (const txn of partnerTxns) {
    on(txn.txnDate).partnerNetPaidPaise +=
      txn.direction === "PAID_TO_PARTNER" ? txn.amountPaise : -txn.amountPaise;
  }

  const rows = [...byDay.entries()].map(([date, totals]) => ({ date, ...totals }));
  const totals = emptyDay();
  for (const row of rows) {
    for (const key of Object.keys(totals) as (keyof DayTotals)[]) totals[key] += row[key];
  }
  return { from: range.from, to: range.to, days: rows, totals };
}
