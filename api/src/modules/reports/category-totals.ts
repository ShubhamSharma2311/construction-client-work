import type { ExpenseCategory } from "../expenses/expenses.schema.ts";
import { emptyByCategory } from "./reports.schema.ts";

/** Every category present, zero where nothing was spent, from a groupBy over expenses. */
export function categoryTotals(
  groups: readonly { category: ExpenseCategory; _sum: { amountPaise: number | null } }[],
): Record<ExpenseCategory, number> {
  const totals = emptyByCategory();
  for (const group of groups) totals[group.category] = group._sum.amountPaise ?? 0;
  return totals;
}
