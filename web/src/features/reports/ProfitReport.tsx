import type { DateRange } from "../../lib/ranges.ts";
import { BigTotal } from "../../ui/FigureStrip.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import { Register, RegisterRow } from "../../ui/Register.tsx";
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_LABELS } from "../expenses/categories.ts";
import styles from "./Reports.module.css";
import { useProfit } from "./useReports.ts";

/** Profit for the dates, set out the way the register would: what came in, what went out. */
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
      <BigTotal label={profitPaise < 0 ? "Loss" : "Profit"}>
        <Money paise={Math.abs(profitPaise)} tone={profitPaise < 0 ? "owed" : "plain"} />
      </BigTotal>
      <h2 className={styles.subhead}>Came in</h2>
      <Register label="Came in">
        <RegisterRow label="Trips" amount={<Money paise={revenue.tripsPaise} />} />
        {revenue.writeOffsPaise > 0 ? (
          <RegisterRow
            label="Less written off"
            detail="Dues forgiven, such as discounts"
            amount={<Money paise={-revenue.writeOffsPaise} />}
          />
        ) : null}
        <RegisterRow label="Earned" amount={<Money paise={revenue.netPaise} />} />
      </Register>
      <h2 className={styles.subhead}>Went out</h2>
      <Register label="Went out">
        {spentOn.map((category) => (
          <RegisterRow
            key={category}
            label={EXPENSE_CATEGORY_LABELS[category]}
            amount={<Money paise={expenses.byCategory[category] ?? 0} />}
          />
        ))}
        <RegisterRow
          label="Driver salaries"
          detail="Salary earned in closed months, whether paid yet or not"
          amount={<Money paise={driverSalaryPaise} />}
        />
        <RegisterRow
          label="Total"
          amount={<Money paise={expenses.totalPaise + driverSalaryPaise} />}
        />
      </Register>
      <p className={styles.note}>
        Money paid to or from the partner is a share of profit, not a cost, so it is not counted
        here.
      </p>
    </div>
  );
}
