import type { DateRange } from "../../lib/ranges.ts";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import styles from "./DieselReport.module.css";
import { type DieselReport as Report, useDieselReport } from "./useExpenses.ts";

type TractorRow = Report["tractors"][number];
type DriverRow = Report["drivers"][number];

const litres = (value: number) =>
  `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;

/** Diesel bills of one tractor or driver over the same dates, behind each report line. */
function billsLink(range: DateRange | null, who: "tractor" | "driver", id: number): string {
  const dates = range ? `from=${range.from}&to=${range.to}` : "range=all";
  return `/expenses?${dates}&category=DIESEL&${who}=${String(id)}`;
}

export function DieselReport({ range }: { range: DateRange | null }) {
  const report = useDieselReport(range);
  if (report.isError)
    return <LoadError error={report.error} onRetry={() => void report.refetch()} />;
  if (!report.data) return <Loading what="the diesel report" />;
  const { totals } = report.data;

  const tractorColumns: Column<TractorRow>[] = [
    { key: "tractor", header: "Tractor", cell: (row) => row.tractor.regNumber, phone: "title" },
    {
      key: "litres",
      header: "Litres",
      cell: (row) => litres(row.litres),
      phone: "hidden",
      numeric: true,
    },
    {
      key: "amount",
      header: "Cost",
      cell: (row) => <Money paise={row.amountPaise} />,
      phone: "amount",
      numeric: true,
    },
    { key: "trips", header: "Trips", cell: (row) => row.trips, phone: "hidden", numeric: true },
    {
      key: "perTrip",
      header: "Litres a trip",
      // A tractor that burned diesel without a trip is worth a look, so it says so.
      cell: (row) => (row.litresPerTrip === null ? "no trips" : litres(row.litresPerTrip)),
      phone: "status",
      numeric: true,
    },
  ];
  const driverColumns: Column<DriverRow>[] = [
    { key: "driver", header: "Driver", cell: (row) => row.driver.name, phone: "title" },
    {
      key: "litres",
      header: "Litres",
      cell: (row) => litres(row.litres),
      phone: "hidden",
      numeric: true,
    },
    {
      key: "amount",
      header: "Cost",
      cell: (row) => <Money paise={row.amountPaise} />,
      phone: "amount",
      numeric: true,
    },
    { key: "trips", header: "Trips", cell: (row) => row.trips, phone: "status", numeric: true },
  ];

  return (
    <>
      <dl className={styles.totals}>
        <div>
          <dt>Diesel</dt>
          <dd>{litres(totals.litres)}</dd>
        </div>
        <div>
          <dt>Cost</dt>
          <dd>
            <Money paise={totals.amountPaise} />
          </dd>
        </div>
        <div>
          <dt>Trips</dt>
          <dd>{totals.trips}</dd>
        </div>
      </dl>
      <h2 className={styles.subhead}>By tractor</h2>
      <EntryTable
        caption="Diesel by tractor"
        rows={report.data.tractors}
        columns={tractorColumns}
        rowKey={(row) => row.tractor.id}
        rowLink={(row) => billsLink(range, "tractor", row.tractor.id)}
        rowLabel={(row) => `${row.tractor.regNumber} diesel bills`}
        phoneMeta={(row) => `${litres(row.litres)}, ${String(row.trips)} trips`}
        empty="No diesel in these dates."
      />
      <h2 className={styles.subhead}>By driver</h2>
      <EntryTable
        caption="Diesel by driver"
        rows={report.data.drivers}
        columns={driverColumns}
        rowKey={(row) => row.driver.id}
        rowLink={(row) => billsLink(range, "driver", row.driver.id)}
        rowLabel={(row) => `${row.driver.name} diesel bills`}
        phoneMeta={(row) => litres(row.litres)}
        empty="No diesel in these dates."
      />
    </>
  );
}
