import type { DateRange } from "../../lib/ranges.ts";
import { formatRupees } from "../../lib/money.ts";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { Register, RegisterRow } from "../../ui/Register.tsx";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "../expenses/categories.ts";
import styles from "./Reports.module.css";
import { useProfit } from "./useReports.ts";

/** Profit for the dates: what trips earned, due or paid, less what the business cost to run. */
export function ProfitReport({ range }: { range: DateRange }) {
  const report = useProfit(range);
  if (report.isError)
    return <LoadError error={report.error} onRetry={() => void report.refetch()} />;
  if (!report.data) return <Loading what="the profit" />;
  const { revenue, expenses, driverSalaryPaise, profitPaise } = report.data;
  const spentOn = EXPENSE_CATEGORIES.filter(
    (category) => (expenses.byCategory[category] ?? 0) !== 0,
  );

  return (
    <div className={styles.report}>
      {/* The answer the screen is for, set apart in navy as in the approved preview. */}
      <div className="flex flex-col gap-1 rounded-xl bg-sidebar p-6 text-white">
        <span className="text-sm text-sidebar-foreground">
          {profitPaise < 0 ? "Loss" : "Profit"}
        </span>
        <span
          className={`text-4xl font-semibold tracking-tight tabular-nums ${profitPaise < 0 ? "text-red-300" : ""}`}
        >
          {formatRupees(Math.abs(profitPaise))}
        </span>
      </div>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className="grid gap-3" aria-label="Income">
          <h2 className={styles.subhead}>Income</h2>
          <Register label="Income">
            <RegisterRow label="Trips" amount={<Money paise={revenue.tripsPaise} />} />
            {revenue.writeOffsPaise > 0 ? (
              <RegisterRow
                label="Less discounts"
                detail="Money customers were let off paying"
                amount={<Money paise={-revenue.writeOffsPaise} />}
              />
            ) : null}
            <RegisterRow label="Total income" amount={<Money paise={revenue.netPaise} />} />
          </Register>
        </section>
        <section className="grid gap-3" aria-label="Expenses">
          <h2 className={styles.subhead}>Expenses</h2>
          <Register label="Expenses">
            {spentOn.map((category) => (
              <RegisterRow
                key={category}
                label={EXPENSE_CATEGORY_LABELS[category]}
                amount={<Money paise={expenses.byCategory[category] ?? 0} />}
              />
            ))}
            <RegisterRow
              label="Driver salaries"
              detail="Salary for closed months and bonuses, whether paid yet or not"
              amount={<Money paise={driverSalaryPaise} />}
            />
            <RegisterRow
              label="Total"
              amount={<Money paise={expenses.totalPaise + driverSalaryPaise} />}
            />
          </Register>
        </section>
      </div>
      <p className={styles.note}>
        Money paid to or from the partner is a share of profit, not a cost, so it is not counted
        here.
      </p>
    </div>
  );
}
