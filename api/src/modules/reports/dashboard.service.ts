import { dayFilter, todayIST, type IsoDate } from "../../lib/dates.ts";
import { AppError } from "../../lib/errors.ts";
import type { Db } from "../../lib/prisma.ts";
import { listDues } from "../customer-ledger/ledger.service.ts";
import { emiDue } from "../loans/loans.service.ts";
import { balanceAtEndOf } from "./cash-flows.ts";
import { categoryTotals } from "./category-totals.ts";
import type { Dashboard } from "./reports.schema.ts";
import { dailySummary } from "./summary.service.ts";

/**
 * One screen for the owner: the chosen day's activity and the money held at its end, with
 * dues and overdue EMIs as they stand now (no history of those is kept per day).
 */
export async function dashboard(db: Db, date: IsoDate | undefined, now: Date): Promise<Dashboard> {
  const today = todayIST(now);
  const day = date ?? today;
  if (day > today) throw new AppError("VALIDATION", `${day} has not happened yet`);

  const dayFigures = await db.$transaction(async (tx) => {
    const summary = await dailySummary(tx, { from: day, to: day });
    const groups = await tx.expense.groupBy({
      by: ["category"],
      where: { deletedAt: null, spentOn: dayFilter({ from: day, to: day }) },
      _sum: { amountPaise: true },
      orderBy: { category: "asc" },
    });
    return {
      totals: summary.totals,
      expensesByCategory: categoryTotals(groups),
      cash: await balanceAtEndOf(tx, "CASH", day),
      online: await balanceAtEndOf(tx, "ONLINE", day),
    };
  });
  const [dues, emis] = await Promise.all([listDues(db, now), emiDue(db, { days: 0 }, now)]);
  return {
    date: day,
    day: dayFigures.totals,
    expensesByCategory: dayFigures.expensesByCategory,
    cashInHandPaise: dayFigures.cash,
    onlineBalancePaise: dayFigures.online,
    totalDuesPaise: dues.totals.balancePaise,
    overdueEmis: emis.items.filter((item) => item.status === "OVERDUE").length,
    topDues: dues.customers.slice(0, 5).map((row) => ({
      customer: { id: row.customer.id, name: row.customer.name },
      balancePaise: row.balancePaise,
      oldestDueDate: row.oldestDueDate,
    })),
  };
}
