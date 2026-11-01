import { toCsv, type CsvColumn } from "../../lib/csv.ts";
import {
  daysBetween,
  fromDbDate,
  toDbDate,
  todayIST,
  type IsoDate,
  dayFilter,
} from "../../lib/dates.ts";
import { notFound } from "../../lib/errors.ts";
import { paiseToRupeeString } from "../../lib/money.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import {
  AGE_BUCKETS,
  type AgeBucket,
  type DueRow,
  type Dues,
  type Ledger,
  type LedgerEntry,
  type LedgerQuery,
} from "./ledger.schema.ts";

type EntryWithoutBalance = Omit<LedgerEntry, "balancePaise"> & { order: number };

// Same-day order: the register due first, then deliveries, then money received.
const ORDER = { OPENING_BALANCE: 0, TRIP: 1, PAYMENT: 2, WRITE_OFF: 2 } as const;

async function balanceBefore(tx: Tx, customerId: number, day: IsoDate): Promise<number> {
  const before = toDbDate(day);
  const [billed, paid] = await Promise.all([
    tx.trip.aggregate({
      where: { customerId, deletedAt: null, tripDate: { lt: before } },
      _sum: { amountPaise: true },
    }),
    tx.customerPayment.aggregate({
      where: { customerId, deletedAt: null, paidOn: { lt: before } },
      _sum: { amountPaise: true },
    }),
  ]);
  return (billed._sum.amountPaise ?? 0) - (paid._sum.amountPaise ?? 0);
}

async function entriesIn(
  tx: Tx,
  customerId: number,
  range: LedgerQuery,
): Promise<EntryWithoutBalance[]> {
  const [trips, payments] = await Promise.all([
    tx.trip.findMany({
      where: { customerId, deletedAt: null, tripDate: dayFilter(range) },
      include: { khet: { select: { name: true } }, tractor: { select: { regNumber: true } } },
    }),
    tx.customerPayment.findMany({
      where: { customerId, deletedAt: null, paidOn: dayFilter(range) },
    }),
  ]);
  const tripEntries = trips.map((trip): EntryWithoutBalance => ({
    date: fromDbDate(trip.tripDate),
    type: trip.kind,
    refId: trip.id,
    description:
      trip.kind === "OPENING_BALANCE"
        ? "Due carried over from the old register"
        : `Trip from ${trip.khet?.name ?? "?"} on ${trip.tractor?.regNumber ?? "?"}${trip.quantityNote ? ` (${trip.quantityNote})` : ""}`,
    debitPaise: trip.amountPaise,
    creditPaise: 0,
    order: ORDER[trip.kind],
  }));
  const paymentEntries = payments.map((payment): EntryWithoutBalance => ({
    date: fromDbDate(payment.paidOn),
    type: payment.kind,
    refId: payment.id,
    description:
      payment.kind === "WRITE_OFF"
        ? "Discount"
        : `${payment.mode === "CASH" ? "Cash" : "Online"} payment${payment.reference ? ` (${payment.reference})` : ""}`,
    debitPaise: 0,
    creditPaise: payment.amountPaise,
    order: ORDER[payment.kind],
  }));
  return [...tripEntries, ...paymentEntries].sort(
    (a, b) => a.date.localeCompare(b.date) || a.order - b.order || a.refId - b.refId,
  );
}

/** A customer's statement: opening balance, every trip and payment, running balance. */
export async function customerLedger(
  db: Db,
  customerId: number,
  range: LedgerQuery,
): Promise<Ledger> {
  return db.$transaction(async (tx) => {
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw notFound("Customer", customerId);
    const opening = range.from ? await balanceBefore(tx, customerId, range.from) : 0;

    let running = opening;
    let debitPaise = 0;
    let creditPaise = 0;
    const entries = (await entriesIn(tx, customerId, range)).map((entry): LedgerEntry => {
      running += entry.debitPaise - entry.creditPaise;
      debitPaise += entry.debitPaise;
      creditPaise += entry.creditPaise;
      return {
        date: entry.date,
        type: entry.type,
        refId: entry.refId,
        description: entry.description,
        debitPaise: entry.debitPaise,
        creditPaise: entry.creditPaise,
        balancePaise: running,
      };
    });
    return {
      customer: { id: customer.id, name: customer.name, phone: customer.phone },
      from: range.from ?? null,
      to: range.to ?? null,
      openingBalancePaise: opening,
      entries,
      totals: { debitPaise, creditPaise },
      closingBalancePaise: running,
    };
  });
}

interface LedgerCsvRow {
  date: string;
  type: LedgerEntry["type"] | "BROUGHT_FORWARD";
  refId: number | null;
  description: string;
  debitPaise: number;
  creditPaise: number;
  balancePaise: number;
}

const ledgerColumns: CsvColumn<LedgerCsvRow>[] = [
  { header: "Date", value: (row) => row.date },
  { header: "Type", value: (row) => row.type },
  { header: "Ref #", value: (row) => row.refId },
  { header: "Details", value: (row) => row.description },
  { header: "Debit (Rs)", value: (row) => paiseToRupeeString(row.debitPaise) },
  { header: "Credit (Rs)", value: (row) => paiseToRupeeString(row.creditPaise) },
  { header: "Balance (Rs)", value: (row) => paiseToRupeeString(row.balancePaise) },
];

/** The statement as CSV; its first row carries the balance from before the period. */
export function ledgerToCsv(ledger: Ledger): string {
  const broughtForward: LedgerCsvRow = {
    date: ledger.from ?? "",
    type: "BROUGHT_FORWARD",
    refId: null,
    description: "Balance brought forward",
    debitPaise: 0,
    creditPaise: 0,
    balancePaise: ledger.openingBalancePaise,
  };
  return toCsv(ledgerColumns, [broughtForward, ...ledger.entries]);
}

export function ageBucket(ageDays: number): AgeBucket {
  if (ageDays <= 7) return "0-7";
  if (ageDays <= 30) return "8-30";
  if (ageDays <= 90) return "31-90";
  return "90+";
}

interface DueSqlRow {
  id: number;
  name: string;
  phone: string | null;
  balance: bigint;
  due: bigint;
  credit: bigint;
  /** ISO text: SQLite hands back a view's aggregated date as stored. */
  oldest: string | null;
}

/** Every customer who owes money, largest first, aged by their oldest unpaid trip. */
export async function listDues(db: Db, now: Date): Promise<Dues> {
  const today = todayIST(now);
  const rows = await db.$queryRaw<DueSqlRow[]>`
    SELECT c.id, c.name, c.phone, ct.balance, ct.due, ct.credit, ct."oldestDueDate" AS oldest
    FROM "CustomerTotals" ct JOIN "Customer" c ON c.id = ct."customerId"
    WHERE ct.balance > 0
    ORDER BY ct.balance DESC, c.id ASC`;

  const byBucket = Object.fromEntries(AGE_BUCKETS.map((bucket) => [bucket, 0])) as Record<
    AgeBucket,
    number
  >;
  let balanceTotal = 0;
  const customers = rows.map((row): DueRow => {
    // A positive balance always leaves some trip unpaid, so `oldest` is set.
    if (!row.oldest)
      throw new Error(`Customer ${String(row.id)} owes money but has no unpaid trip`);
    const oldestDueDate = fromDbDate(new Date(row.oldest));
    const ageDays = daysBetween(oldestDueDate, today);
    const bucket = ageBucket(ageDays);
    const balancePaise = Number(row.balance);
    byBucket[bucket] += balancePaise;
    balanceTotal += balancePaise;
    return {
      customer: { id: row.id, name: row.name, phone: row.phone },
      balancePaise,
      duePaise: Number(row.due),
      creditPaise: Number(row.credit),
      oldestDueDate,
      ageDays,
      bucket,
      hasUnappliedCredit: Number(row.credit) > 0,
    };
  });
  return { asOf: today, customers, totals: { balancePaise: balanceTotal, byBucket } };
}

const dueColumns: CsvColumn<DueRow>[] = [
  { header: "Customer", value: (row) => row.customer.name },
  { header: "Phone", value: (row) => row.customer.phone },
  { header: "Balance (Rs)", value: (row) => paiseToRupeeString(row.balancePaise) },
  { header: "Oldest due", value: (row) => row.oldestDueDate },
  { header: "Days", value: (row) => row.ageDays },
  { header: "Age", value: (row) => row.bucket },
  { header: "Unused credit (Rs)", value: (row) => paiseToRupeeString(row.creditPaise) },
];

export function duesToCsv(dues: Dues): string {
  return toCsv(dueColumns, dues.customers);
}
