import { formatDate, todayIso } from "../../lib/dates.ts";
import type { PayMode } from "../../lib/payModes.ts";
import type { DateRange } from "../../lib/ranges.ts";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { FigureStrip } from "../../ui/FigureStrip.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import styles from "./Reports.module.css";
import { type CashBook, useCashBook } from "./useReports.ts";

type Line = CashBook["lines"][number];

/** Where a cash book line opens; driver and partner money is seen on their own pages. */
function lineLink(line: Line): string | null {
  if (line.kind === "CUSTOMER_PAYMENT") return `/payments/${String(line.refId)}`;
  if (line.kind === "EXPENSE") return `/expenses/${String(line.refId)}`;
  return null;
}

export function CashBookReport({ range, mode }: { range: DateRange; mode: PayMode }) {
  const today = todayIso(new Date());
  const book = useCashBook(range, mode);
  if (book.isError) return <LoadError error={book.error} onRetry={() => void book.refetch()} />;
  if (!book.data) return <Loading what="the cash book" />;
  const { data } = book;

  const columns: Column<Line>[] = [
    {
      key: "date",
      header: "Date",
      cell: (line) => formatDate(line.date, today),
      phone: "hidden",
      margin: true,
    },
    { key: "what", header: "Entry", cell: (line) => line.description, phone: "title" },
    {
      key: "in",
      header: "In",
      cell: (line) => (line.inPaise ? <Money paise={line.inPaise} tone="received" /> : ""),
      phone: "hidden",
      numeric: true,
    },
    {
      key: "out",
      header: "Out",
      cell: (line) => (line.outPaise ? <Money paise={line.outPaise} /> : ""),
      phone: "hidden",
      numeric: true,
    },
    {
      key: "change",
      header: "",
      cell: (line) =>
        line.inPaise ? (
          <Money paise={line.inPaise} tone="received" />
        ) : (
          <Money paise={-line.outPaise} />
        ),
      phone: "amount",
      numeric: true,
      phoneOnly: true,
    },
    {
      key: "balance",
      header: "Balance",
      cell: (line) => (
        <Money paise={line.balancePaise} tone={line.balancePaise < 0 ? "owed" : "plain"} />
      ),
      phone: "status",
      numeric: true,
    },
  ];

  return (
    <div className={styles.report}>
      <FigureStrip
        label="Cash book totals"
        figures={[
          { label: "At the start", value: <Money paise={data.openingPaise} /> },
          { label: "In", value: <Money paise={data.totals.inPaise} tone="received" /> },
          { label: "Out", value: <Money paise={data.totals.outPaise} /> },
          {
            label: "At the end",
            value: (
              <Money paise={data.closingPaise} tone={data.closingPaise < 0 ? "owed" : "plain"} />
            ),
          },
        ]}
      />
      <EntryTable
        caption="Cash book"
        rows={data.lines}
        columns={columns}
        rowKey={(line) => `${line.kind}-${String(line.refId)}`}
        rowLink={lineLink}
        rowLabel={(line) => `${line.description}, ${formatDate(line.date, today)}`}
        phoneMeta={(line) => formatDate(line.date, today)}
        empty="No money moved in these dates."
      />
    </div>
  );
}
