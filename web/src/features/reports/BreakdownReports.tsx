import { formatRupees } from "../../lib/money.ts";
import type { DateRange } from "../../lib/ranges.ts";
import { type Column, EntryTable } from "../../ui/EntryTable.tsx";
import { Loading, LoadError } from "../../ui/LoadState.tsx";
import { Money } from "../../ui/Money.tsx";
import styles from "./Reports.module.css";
import {
  type DriverReport,
  type KhetReport,
  type TractorReport,
  useDriverReport,
  useKhetReport,
  useTractorReport,
} from "./useReports.ts";

type TractorLine = TractorReport["tractors"][number];
type KhetLine = KhetReport["khets"][number];
type DriverLine = DriverReport["drivers"][number];

const litres = (value: number) =>
  `${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })} L`;

/** What each tractor earned against what it cost to run; a tractor that cost more shows red. */
export function TractorsReport({ range }: { range: DateRange }) {
  const report = useTractorReport(range);
  if (report.isError)
    return <LoadError error={report.error} onRetry={() => void report.refetch()} />;
  if (!report.data) return <Loading what="the tractors" />;
  const columns: Column<TractorLine>[] = [
    {
      key: "tractor",
      header: "Tractor",
      cell: (line) => line.tractor.regNumber,
      phone: "title",
      margin: true,
    },
    { key: "trips", header: "Trips", cell: (line) => line.trips, phone: "hidden", numeric: true },
    {
      key: "earned",
      header: "Earned",
      cell: (line) => <Money paise={line.revenuePaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "diesel",
      header: "Diesel",
      cell: (line) => <Money paise={line.dieselPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "service",
      header: "Service",
      cell: (line) => <Money paise={line.servicePaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "emi",
      header: "EMI",
      cell: (line) => <Money paise={line.emiPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "other",
      header: "Other",
      cell: (line) => <Money paise={line.otherPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "left",
      header: "Left over",
      cell: (line) => (
        <Money
          paise={line.contributionPaise}
          tone={line.contributionPaise < 0 ? "owed" : "plain"}
        />
      ),
      phone: "amount",
      numeric: true,
    },
  ];
  return (
    <div className={styles.report}>
      <p className={styles.note}>
        Left over is what a tractor earned less its diesel, service, EMI and other costs.
      </p>
      <EntryTable
        caption="By tractor"
        rows={report.data.tractors}
        columns={columns}
        rowKey={(line) => line.tractor.id}
        rowLink={(line) => `/tractors/${String(line.tractor.id)}`}
        rowLabel={(line) => line.tractor.regNumber}
        phoneMeta={(line) =>
          `${String(line.trips)} trips, earned ${formatRupees(line.revenuePaise)}, cost ${formatRupees(
            line.dieselPaise + line.servicePaise + line.emiPaise + line.otherPaise,
          )}`
        }
        empty="No tractor worked in these dates."
      />
    </div>
  );
}

export function KhetsReport({ range }: { range: DateRange }) {
  const report = useKhetReport(range);
  if (report.isError)
    return <LoadError error={report.error} onRetry={() => void report.refetch()} />;
  if (!report.data) return <Loading what="the khets" />;
  const columns: Column<KhetLine>[] = [
    { key: "khet", header: "Khet", cell: (line) => line.khet.name, phone: "title", margin: true },
    { key: "trips", header: "Trips", cell: (line) => line.trips, phone: "hidden", numeric: true },
    {
      key: "earned",
      header: "Earned",
      cell: (line) => <Money paise={line.revenuePaise} />,
      phone: "amount",
      numeric: true,
    },
  ];
  return (
    <EntryTable
      caption="By khet"
      rows={report.data.khets}
      columns={columns}
      rowKey={(line) => line.khet.id}
      phoneMeta={(line) => `${String(line.trips)} trips`}
      empty="No sand came from any khet in these dates."
    />
  );
}

export function DriversReport({ range }: { range: DateRange }) {
  const report = useDriverReport(range);
  if (report.isError)
    return <LoadError error={report.error} onRetry={() => void report.refetch()} />;
  if (!report.data) return <Loading what="the drivers" />;
  const columns: Column<DriverLine>[] = [
    {
      key: "driver",
      header: "Driver",
      cell: (line) => line.driver.name,
      phone: "title",
      margin: true,
    },
    { key: "trips", header: "Trips", cell: (line) => line.trips, phone: "hidden", numeric: true },
    {
      key: "earned",
      header: "Trips earned",
      cell: (line) => <Money paise={line.revenuePaise} />,
      phone: "amount",
      numeric: true,
    },
    {
      key: "diesel",
      header: "Diesel",
      cell: (line) => `${litres(line.dieselLitres)}, ${formatRupees(line.dieselPaise)}`,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "salary",
      header: "Salary earned",
      cell: (line) => <Money paise={line.salaryEarnedPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "advances",
      header: "Advances",
      cell: (line) => <Money paise={line.advancesPaise} />,
      phone: "hidden",
      numeric: true,
    },
    {
      key: "paid",
      header: "Salary paid",
      cell: (line) => <Money paise={line.salaryPaidPaise} />,
      phone: "hidden",
      numeric: true,
    },
  ];
  return (
    <EntryTable
      caption="By driver"
      rows={report.data.drivers}
      columns={columns}
      rowKey={(line) => line.driver.id}
      rowLink={(line) => `/drivers/${String(line.driver.id)}`}
      rowLabel={(line) => line.driver.name}
      phoneMeta={(line) =>
        `${String(line.trips)} trips, ${litres(line.dieselLitres)} diesel, ${formatRupees(line.advancesPaise)} advances`
      }
      empty="No driver worked in these dates."
    />
  );
}
