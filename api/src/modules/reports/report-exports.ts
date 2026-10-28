import { toCsv, type CsvColumn } from "../../lib/csv.ts";
import { paiseToRupeeString } from "../../lib/money.ts";
import type {
  CashLine,
  Cashbook,
  DaySummary,
  DriverReport,
  KhetReport,
  Pnl,
  Summary,
  TractorReport,
} from "./reports.schema.ts";

const rupees = paiseToRupeeString;

export function pnlToCsv(pnl: Pnl): string {
  const lines: { item: string; amountPaise: number }[] = [
    { item: "Trip revenue", amountPaise: pnl.revenue.tripsPaise },
    { item: "Less write-offs", amountPaise: -pnl.revenue.writeOffsPaise },
    ...Object.entries(pnl.expenses.byCategory).map(([category, amountPaise]) => ({
      item: `Less ${category}`,
      amountPaise: -amountPaise,
    })),
    { item: "Less driver salary", amountPaise: -pnl.driverSalaryPaise },
    { item: "Profit", amountPaise: pnl.profitPaise },
  ];
  return toCsv(
    [
      { header: "Item", value: (line) => line.item },
      { header: "Amount (Rs)", value: (line) => rupees(line.amountPaise) },
    ],
    lines,
  );
}

interface CashCsvRow {
  date: string;
  kind: CashLine["kind"] | "BROUGHT_FORWARD";
  refId: number | null;
  description: string;
  inPaise: number;
  outPaise: number;
  balancePaise: number;
}

const cashColumns: CsvColumn<CashCsvRow>[] = [
  { header: "Date", value: (line) => line.date },
  { header: "Kind", value: (line) => line.kind },
  { header: "Ref #", value: (line) => line.refId },
  { header: "Details", value: (line) => line.description },
  { header: "In (Rs)", value: (line) => rupees(line.inPaise) },
  { header: "Out (Rs)", value: (line) => rupees(line.outPaise) },
  { header: "Balance (Rs)", value: (line) => rupees(line.balancePaise) },
];

/** The book as CSV; its first row carries the balance from before the period. */
export function cashbookToCsv(book: Cashbook): string {
  const broughtForward: CashCsvRow = {
    date: book.from ?? "",
    kind: "BROUGHT_FORWARD",
    refId: null,
    description: "Balance brought forward",
    inPaise: 0,
    outPaise: 0,
    balancePaise: book.openingPaise,
  };
  return toCsv(cashColumns, [broughtForward, ...book.lines]);
}

const dayColumns: CsvColumn<DaySummary>[] = [
  { header: "Date", value: (row) => row.date },
  { header: "Trips", value: (row) => row.trips },
  { header: "Revenue (Rs)", value: (row) => rupees(row.revenuePaise) },
  { header: "Cash in (Rs)", value: (row) => rupees(row.cashInPaise) },
  { header: "Online in (Rs)", value: (row) => rupees(row.onlineInPaise) },
  { header: "New dues (Rs)", value: (row) => rupees(row.newDuesPaise) },
  { header: "Dues recovered (Rs)", value: (row) => rupees(row.duesRecoveredPaise) },
  { header: "Expenses (Rs)", value: (row) => rupees(row.expensesPaise) },
  { header: "Driver payments (Rs)", value: (row) => rupees(row.driverPaymentsPaise) },
  { header: "Partner net (Rs)", value: (row) => rupees(row.partnerNetPaidPaise) },
];

export function summaryToCsv(summary: Summary): string {
  return toCsv(dayColumns, summary.days);
}

export function tractorReportToCsv(report: TractorReport): string {
  return toCsv(
    [
      { header: "Tractor", value: (row) => row.tractor.regNumber },
      { header: "Trips", value: (row) => row.trips },
      { header: "Revenue (Rs)", value: (row) => rupees(row.revenuePaise) },
      { header: "Diesel (Rs)", value: (row) => rupees(row.dieselPaise) },
      { header: "Service (Rs)", value: (row) => rupees(row.servicePaise) },
      { header: "EMI (Rs)", value: (row) => rupees(row.emiPaise) },
      { header: "Other (Rs)", value: (row) => rupees(row.otherPaise) },
      { header: "Contribution (Rs)", value: (row) => rupees(row.contributionPaise) },
    ],
    report.tractors,
  );
}

export function khetReportToCsv(report: KhetReport): string {
  return toCsv(
    [
      { header: "Khet", value: (row) => row.khet.name },
      { header: "Trips", value: (row) => row.trips },
      { header: "Revenue (Rs)", value: (row) => rupees(row.revenuePaise) },
    ],
    report.khets,
  );
}

export function driverReportToCsv(report: DriverReport): string {
  return toCsv(
    [
      { header: "Driver", value: (row) => row.driver.name },
      { header: "Trips", value: (row) => row.trips },
      { header: "Revenue (Rs)", value: (row) => rupees(row.revenuePaise) },
      { header: "Diesel (L)", value: (row) => row.dieselLitres },
      { header: "Diesel (Rs)", value: (row) => rupees(row.dieselPaise) },
      { header: "Salary earned (Rs)", value: (row) => rupees(row.salaryEarnedPaise) },
      { header: "Advances (Rs)", value: (row) => rupees(row.advancesPaise) },
      { header: "Salary paid (Rs)", value: (row) => rupees(row.salaryPaidPaise) },
    ],
    report.drivers,
  );
}
