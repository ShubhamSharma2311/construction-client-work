import { formatDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import type { DateRange } from "../../lib/ranges.ts";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { FigureStrip } from "../../ui/FigureStrip.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import styles from "./Reports.module.css";
import { type DaySummary, useDaySummary } from "./useReports.ts";

type Day = DaySummary["days"][number];

export function DayByDayReport({ range }: { range: DateRange }) {
  const today = todayIso(new Date());
  const summary = useDaySummary(range);
  if (summary.isError)
    return <LoadError error={summary.error} onRetry={() => void summary.refetch()} />;
  if (!summary.data) return <Loading what="the days" />;
  const { totals } = summary.data;

  const columns: Column<Day>[] = [
    {
      key: "date",
      header: "Day",
      cell: (day) => formatDate(day.date, today),
      phone: "title",
      margin: true,
    },
    { key: "trips", header: "Trips", cell: (day) => day.trips, phone: "hidden", numeric: true },
    {
      key: "earned",
      header: "Earned",
      cell: (day) => <Money paise={day.revenuePaise} />,
      phone: "amount",
      numeric: true,
    },
    {
      key: "cash",
      header: "Cash in",
      cell: (day) => <Money paise={day.cashInPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "online",
      header: "Online in",
      cell: (day) => <Money paise={day.onlineInPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "due",
      header: "Left due",
      cell: (day) => (
        <Money paise={day.newDuesPaise} tone={day.newDuesPaise > 0 ? "owed" : "plain"} />
      ),
      phone: "hidden",
      numeric: true,
    },
    {
      key: "spent",
      header: "Spent",
      cell: (day) => <Money paise={day.expensesPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "drivers",
      header: "Drivers",
      cell: (day) => <Money paise={day.driverPaymentsPaise} />,
      phone: "hidden",
      numeric: true,
    },
  ];

  return (
    <div className={styles.report}>
      <FigureStrip
        label="Totals"
        figures={[
          { label: "Trips", value: totals.trips },
          { label: "Earned", value: <Money paise={totals.revenuePaise} /> },
          {
            label: "Came in",
            value: <Money paise={totals.cashInPaise + totals.onlineInPaise} tone="received" />,
          },
          { label: "Spent", value: <Money paise={totals.expensesPaise} /> },
        ]}
      />
      <EntryTable
        caption="Daily summary"
        rows={summary.data.days}
        columns={columns}
        rowKey={(day) => day.date}
        // Each day opens on Today for that date, with the full picture of it.
        rowLink={(day) => `/?date=${day.date}`}
        rowLabel={(day) => formatDate(day.date, today)}
        phoneMeta={(day) =>
          `${String(day.trips)} trips, ${formatRupees(day.cashInPaise + day.onlineInPaise)} in, ${formatRupees(day.expensesPaise)} spent`
        }
        empty="Nothing entered in these dates."
      />
    </div>
  );
}
