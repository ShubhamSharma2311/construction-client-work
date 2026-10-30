import { addDays, dayFilter, fromDbDate, toDbDate, type IsoDate } from "../../lib/dates.ts";
import type { DriverPaymentType, ExpenseCategory } from "../../generated/prisma/enums.ts";
import type { Tx } from "../../lib/prisma.ts";
import type { PayMode } from "../trips/trips.schema.ts";
import type { CashLine } from "./reports.schema.ts";

export type CashFlow = Omit<CashLine, "balancePaise">;

interface Range {
  from?: IsoDate;
  to?: IsoDate;
}

// Same day: money in shows before money out, then by source, then by entry order.
const KIND_ORDER: Record<CashFlow["kind"], number> = {
  CUSTOMER_PAYMENT: 0,
  FROM_PARTNER: 1,
  EXPENSE: 2,
  DRIVER_PAYMENT: 3,
  TO_PARTNER: 4,
};

// Lines are read by the owner on screen and in the export, so they use words, not code names.
const CATEGORY_WORDS: Record<ExpenseCategory, string> = {
  LABOUR: "Labour",
  DIESEL: "Diesel",
  ROYALTY: "Royalty",
  POLICE: "Police",
  OTHER: "Other",
  EMERGENCY: "Emergency",
  TRACTOR_SERVICE: "Tractor repair",
  TRACTOR_EMI: "Tractor EMI",
};

const DRIVER_PAYMENT_WORDS: Record<DriverPaymentType, string> = {
  ADVANCE: "Advance",
  SALARY: "Salary",
  BONUS: "Bonus",
};

/**
 * Every rupee that moved through cash (or the bank, for ONLINE): customer payments and
 * money from the partner in; expenses, driver payments and money to the partner out.
 * Write-offs move no money and are not here.
 */
export async function cashFlows(tx: Tx, mode: PayMode, range: Range): Promise<CashFlow[]> {
  const days = dayFilter(range);
  const [payments, partnerTxns, expenses, driverPayments] = await Promise.all([
    tx.customerPayment.findMany({
      where: { kind: "PAYMENT", mode, deletedAt: null, paidOn: days },
      include: { customer: { select: { name: true } } },
    }),
    tx.partnerTxn.findMany({
      where: { mode, deletedAt: null, txnDate: days },
      include: { partner: { select: { name: true } } },
    }),
    tx.expense.findMany({
      where: { mode, deletedAt: null, spentOn: days },
      include: {
        labourer: { select: { name: true } },
        tractor: { select: { regNumber: true } },
        driver: { select: { name: true } },
      },
    }),
    tx.driverPayment.findMany({
      where: { mode, deletedAt: null, paidOn: days },
      include: { driver: { select: { name: true } } },
    }),
  ]);

  const flows: CashFlow[] = [
    ...payments.map((row) => ({
      date: fromDbDate(row.paidOn),
      kind: "CUSTOMER_PAYMENT" as const,
      refId: row.id,
      description: `Payment from ${row.customer.name}${row.reference ? ` (${row.reference})` : ""}`,
      inPaise: row.amountPaise,
      outPaise: 0,
    })),
    ...partnerTxns.map((row) => {
      const incoming = row.direction === "RECEIVED_FROM_PARTNER";
      return {
        date: fromDbDate(row.txnDate),
        kind: incoming ? ("FROM_PARTNER" as const) : ("TO_PARTNER" as const),
        refId: row.id,
        description: `${incoming ? "Received from" : "Paid to"} partner ${row.partner.name}`,
        inPaise: incoming ? row.amountPaise : 0,
        outPaise: incoming ? 0 : row.amountPaise,
      };
    }),
    ...expenses.map((row) => ({
      date: fromDbDate(row.spentOn),
      kind: "EXPENSE" as const,
      refId: row.id,
      description: [
        CATEGORY_WORDS[row.category],
        row.labourer?.name,
        row.tractor?.regNumber,
        row.driver?.name,
        row.notes,
      ]
        .filter(Boolean)
        .join(", "),
      inPaise: 0,
      outPaise: row.amountPaise,
    })),
    ...driverPayments.map((row) => ({
      date: fromDbDate(row.paidOn),
      kind: "DRIVER_PAYMENT" as const,
      refId: row.id,
      description: `${DRIVER_PAYMENT_WORDS[row.type]} to ${row.driver.name}`,
      inPaise: 0,
      outPaise: row.amountPaise,
    })),
  ];
  return flows.sort(
    (a, b) =>
      a.date.localeCompare(b.date) || KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || a.refId - b.refId,
  );
}

/** Money in minus money out for one mode on every day before `day`. */
export async function netFlowBefore(tx: Tx, mode: PayMode, day: IsoDate): Promise<number> {
  const before = { lt: toDbDate(day) };
  const [paymentsIn, partnerIn, partnerOut, expensesOut, driversOut] = await Promise.all([
    tx.customerPayment.aggregate({
      where: { kind: "PAYMENT", mode, deletedAt: null, paidOn: before },
      _sum: { amountPaise: true },
    }),
    tx.partnerTxn.aggregate({
      where: { direction: "RECEIVED_FROM_PARTNER", mode, deletedAt: null, txnDate: before },
      _sum: { amountPaise: true },
    }),
    tx.partnerTxn.aggregate({
      where: { direction: "PAID_TO_PARTNER", mode, deletedAt: null, txnDate: before },
      _sum: { amountPaise: true },
    }),
    tx.expense.aggregate({
      where: { mode, deletedAt: null, spentOn: before },
      _sum: { amountPaise: true },
    }),
    tx.driverPayment.aggregate({
      where: { mode, deletedAt: null, paidOn: before },
      _sum: { amountPaise: true },
    }),
  ]);
  const sum = (result: { _sum: { amountPaise: number | null } }) => result._sum.amountPaise ?? 0;
  return sum(paymentsIn) + sum(partnerIn) - sum(partnerOut) - sum(expensesOut) - sum(driversOut);
}

/** Opening balance from settings for a mode. */
export async function openingFor(tx: Tx, mode: PayMode): Promise<number> {
  const settings = await tx.setting.findUniqueOrThrow({ where: { id: 1 } });
  return mode === "CASH" ? settings.openingCashPaise : settings.openingOnlinePaise;
}

/** Money held in one mode at the end of `day`. */
export async function balanceAtEndOf(tx: Tx, mode: PayMode, day: IsoDate): Promise<number> {
  return (await openingFor(tx, mode)) + (await netFlowBefore(tx, mode, addDays(day, 1)));
}
