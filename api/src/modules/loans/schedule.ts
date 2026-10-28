import { addMonths, dayOfMonth, type IsoDate, type IsoMonth } from "../../lib/dates.ts";

export type InstalmentStatus = "PAID" | "OVERDUE" | "DUE_TODAY" | "UPCOMING" | "CLOSED";

export interface LoanTerms {
  firstEmiMonth: IsoMonth;
  emiDay: number;
  totalInstallments: number;
  closedReason: "PAID_OFF" | "FORECLOSED" | null;
}

export interface PaidInstalment {
  emiMonth: IsoMonth;
  expenseId: number;
  paidOn: IsoDate;
  amountPaise: number;
  lateFeePaise: number;
}

export interface Instalment {
  number: number;
  month: IsoMonth;
  dueDate: IsoDate;
  status: InstalmentStatus;
  payment: PaidInstalment | null;
}

export function lastEmiMonth(terms: LoanTerms): IsoMonth {
  return addMonths(terms.firstEmiMonth, terms.totalInstallments - 1);
}

/** Every instalment of a loan with its status as of `today`. */
export function buildSchedule(
  terms: LoanTerms,
  payments: readonly PaidInstalment[],
  today: IsoDate,
): Instalment[] {
  const paidByMonth = new Map(payments.map((payment) => [payment.emiMonth, payment]));
  return Array.from({ length: terms.totalInstallments }, (_, index) => {
    const month = addMonths(terms.firstEmiMonth, index);
    const dueDate = dayOfMonth(month, terms.emiDay);
    const payment = paidByMonth.get(month) ?? null;
    return {
      number: index + 1,
      month,
      dueDate,
      status: statusOf(terms, payment, dueDate, today),
      payment,
    };
  });
}

function statusOf(
  terms: LoanTerms,
  payment: PaidInstalment | null,
  dueDate: IsoDate,
  today: IsoDate,
): InstalmentStatus {
  if (payment) return "PAID";
  if (terms.closedReason === "FORECLOSED") return "CLOSED";
  if (dueDate < today) return "OVERDUE";
  if (dueDate === today) return "DUE_TODAY";
  return "UPCOMING";
}

export interface ScheduleSummary {
  paidCount: number;
  overdueCount: number;
  nextDue: { month: IsoMonth; dueDate: IsoDate } | null;
}

export function summarise(schedule: readonly Instalment[]): ScheduleSummary {
  const open = schedule.filter(
    (instalment) => instalment.status !== "PAID" && instalment.status !== "CLOSED",
  );
  const next = open[0];
  return {
    paidCount: schedule.filter((instalment) => instalment.status === "PAID").length,
    overdueCount: open.filter((instalment) => instalment.status === "OVERDUE").length,
    nextDue: next ? { month: next.month, dueDate: next.dueDate } : null,
  };
}
