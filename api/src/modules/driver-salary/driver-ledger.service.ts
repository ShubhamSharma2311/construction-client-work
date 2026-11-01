import { dayFilter, fromDbDate, monthOf, type IsoDate } from "../../lib/dates.ts";
import { notFound } from "../../lib/errors.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { driverBalance } from "./driver-balance.ts";
import type { DriverLedger } from "./driver-salary.schema.ts";

type Entry = DriverLedger["entries"][number];
type EntryWithoutBalance = Omit<Entry, "balancePaise">;

const ACCRUAL_TYPE = {
  OPENING_BALANCE: "OPENING_BALANCE",
  MONTH_SALARY: "EARNED_SALARY",
  BONUS: "EARNED_BONUS",
} as const;
const PAYMENT_TYPE = {
  ADVANCE: "PAID_ADVANCE",
  SALARY: "PAID_SALARY",
  BONUS: "PAID_BONUS",
} as const;

async function entriesIn(
  tx: Tx,
  driverId: number,
  range: { from?: IsoDate; to?: IsoDate },
): Promise<EntryWithoutBalance[]> {
  const [accruals, payments] = await Promise.all([
    tx.driverAccrual.findMany({
      where: { driverId, deletedAt: null, accruedOn: dayFilter(range) },
    }),
    tx.driverPayment.findMany({ where: { driverId, deletedAt: null, paidOn: dayFilter(range) } }),
  ]);
  const earned = accruals.map((row): EntryWithoutBalance => ({
    date: fromDbDate(row.accruedOn),
    type: ACCRUAL_TYPE[row.kind],
    refId: row.id,
    description:
      row.kind === "MONTH_SALARY" && row.month
        ? `Salary for ${monthOf(fromDbDate(row.month))}${row.note ? ` (${row.note})` : ""}`
        : (row.note ?? (row.kind === "BONUS" ? "Bonus" : "Balance from the old register")),
    month: row.month ? monthOf(fromDbDate(row.month)) : null,
    note: row.note,
    mode: null,
    earnedPaise: row.amountPaise,
    paidPaise: 0,
  }));
  const paid = payments.map((row): EntryWithoutBalance => ({
    date: fromDbDate(row.paidOn),
    type: PAYMENT_TYPE[row.type],
    refId: row.id,
    description: `${row.type === "ADVANCE" ? "Advance" : row.type === "BONUS" ? "Bonus" : "Salary"} paid (${row.mode.toLowerCase()})${row.notes ? `: ${row.notes}` : ""}`,
    month: row.forMonth ? monthOf(fromDbDate(row.forMonth)) : null,
    note: row.notes,
    mode: row.mode,
    earnedPaise: 0,
    paidPaise: row.amountPaise,
  }));
  // Same day: what was earned shows before what was paid against it.
  return [...earned, ...paid].sort(
    (a, b) =>
      a.date.localeCompare(b.date) ||
      Number(a.paidPaise > 0) - Number(b.paidPaise > 0) ||
      a.refId - b.refId,
  );
}

/** The driver's account: opening balance, every earning and payment, monthly totals. */
export async function driverLedger(
  db: Db,
  driverId: number,
  range: { from?: IsoDate; to?: IsoDate },
): Promise<DriverLedger> {
  return db.$transaction(async (tx) => {
    const driver = await tx.driver.findUnique({ where: { id: driverId } });
    if (!driver) throw notFound("Driver", driverId);
    const opening = range.from ? await driverBalance(tx, driverId, range.from) : 0;

    let running = opening;
    const entries: Entry[] = (await entriesIn(tx, driverId, range)).map((entry) => {
      running += entry.earnedPaise - entry.paidPaise;
      return { ...entry, balancePaise: running };
    });

    const months: DriverLedger["months"] = [];
    for (const entry of entries) {
      const month = entry.date.slice(0, 7);
      const last = months.at(-1);
      const row =
        last?.month === month
          ? last
          : { month, earnedPaise: 0, paidPaise: 0, closingBalancePaise: 0 };
      if (row !== last) months.push(row);
      row.earnedPaise += entry.earnedPaise;
      row.paidPaise += entry.paidPaise;
      row.closingBalancePaise = entry.balancePaise;
    }

    return {
      driver: { id: driver.id, name: driver.name },
      from: range.from ?? null,
      to: range.to ?? null,
      openingBalancePaise: opening,
      entries,
      months,
      closingBalancePaise: running,
    };
  });
}
