import { dayFilter, type ClosedRange } from "../../lib/dates.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { categoryTotals } from "./category-totals.ts";
import type { Pnl } from "./reports.schema.ts";

/**
 * Profit for a period: trip revenue less write-offs, less every expense (EMI included, as
 * the owner pays it), less driver salary and bonus earned. Money to or from the partner is
 * a share of profit, not a cost, so it is left out. Runs inside the caller's snapshot.
 */
export async function profitAndLossIn(tx: Tx, range: ClosedRange): Promise<Pnl> {
  const days = dayFilter(range);
  const [trips, writeOffs, expenseGroups, salary] = await Promise.all([
    tx.trip.aggregate({
      where: { kind: "TRIP", deletedAt: null, tripDate: days },
      _sum: { amountPaise: true },
    }),
    tx.customerPayment.aggregate({
      where: { kind: "WRITE_OFF", deletedAt: null, paidOn: days },
      _sum: { amountPaise: true },
    }),
    tx.expense.groupBy({
      by: ["category"],
      where: { deletedAt: null, spentOn: days },
      _sum: { amountPaise: true },
      orderBy: { category: "asc" },
    }),
    tx.driverAccrual.aggregate({
      where: { kind: { in: ["MONTH_SALARY", "BONUS"] }, deletedAt: null, accruedOn: days },
      _sum: { amountPaise: true },
    }),
  ]);
  const byCategory = categoryTotals(expenseGroups);
  const expensesTotal = Object.values(byCategory).reduce((sum, value) => sum + value, 0);
  const tripsPaise = trips._sum.amountPaise ?? 0;
  const writeOffsPaise = writeOffs._sum.amountPaise ?? 0;
  const driverSalaryPaise = salary._sum.amountPaise ?? 0;
  const netPaise = tripsPaise - writeOffsPaise;
  return {
    from: range.from,
    to: range.to,
    revenue: { tripsPaise, writeOffsPaise, netPaise },
    expenses: { byCategory, totalPaise: expensesTotal },
    driverSalaryPaise,
    profitPaise: netPaise - expensesTotal - driverSalaryPaise,
  };
}

export async function profitAndLoss(db: Db, range: ClosedRange): Promise<Pnl> {
  return db.$transaction((tx) => profitAndLossIn(tx, range), { isolationLevel: "RepeatableRead" });
}
