import type { Prisma } from "#prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import {
  assertBusinessDate,
  daysBetween,
  fromDbDate,
  monthOf,
  monthStart,
  toDbDate,
  todayIST,
  type IsoDate,
  type IsoMonth,
} from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { runIdempotent, type IdempotentResult } from "../../lib/idempotency.ts";
import { formatPaise } from "../../lib/money.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { getBusinessBounds } from "../settings/settings.service.ts";
import type {
  EmiDue,
  EmiDueQuery,
  EmiPaymentInput,
  ForeclosureInput,
  LoanCreateInput,
  LoanDetail,
  LoanDto,
  LoanListQuery,
  LoanPaymentSaved,
  LoanUpdateInput,
} from "./loans.schema.ts";
import {
  buildSchedule,
  lastEmiMonth,
  summarise,
  type Instalment,
  type LoanTerms,
  type PaidInstalment,
} from "./schedule.ts";

const loanInclude = {
  tractor: { select: { id: true, regNumber: true } },
  payments: { where: { deletedAt: null }, orderBy: { id: "asc" } },
} as const satisfies Prisma.TractorLoanInclude;
type LoanRow = Prisma.TractorLoanGetPayload<{ include: typeof loanInclude }>;

function termsOf(row: LoanRow): LoanTerms {
  return {
    firstEmiMonth: monthOf(fromDbDate(row.firstEmiMonth)),
    emiDay: row.emiDay,
    totalInstallments: row.totalInstallments,
    closedReason: row.closedReason,
  };
}

function paidInstalments(row: LoanRow): PaidInstalment[] {
  return row.payments.flatMap((payment) =>
    payment.emiMonth
      ? [
          {
            emiMonth: monthOf(fromDbDate(payment.emiMonth)),
            expenseId: payment.id,
            paidOn: fromDbDate(payment.spentOn),
            amountPaise: payment.amountPaise,
            lateFeePaise: payment.lateFeePaise ?? 0,
          },
        ]
      : [],
  );
}

function scheduleOf(row: LoanRow, today: IsoDate): Instalment[] {
  return buildSchedule(termsOf(row), paidInstalments(row), today);
}

function toDto(row: LoanRow, today: IsoDate): LoanDto {
  const terms = termsOf(row);
  return {
    id: row.id,
    tractor: row.tractor,
    lender: row.lender,
    emiPaise: row.emiPaise,
    emiDay: row.emiDay,
    firstEmiMonth: terms.firstEmiMonth,
    lastEmiMonth: lastEmiMonth(terms),
    totalInstallments: row.totalInstallments,
    closedOn: row.closedOn ? fromDbDate(row.closedOn) : null,
    closedReason: row.closedReason,
    notes: row.notes,
    paidPaise: row.payments.reduce((sum, payment) => sum + payment.amountPaise, 0),
    summary: summarise(scheduleOf(row, today)),
  };
}

/** A foreclosure is the one live payment with no EMI month. */
function foreclosureOf(row: LoanRow): LoanDetail["foreclosure"] {
  const payment = row.payments.find((candidate) => candidate.emiMonth === null);
  return payment
    ? {
        expenseId: payment.id,
        paidOn: fromDbDate(payment.spentOn),
        amountPaise: payment.amountPaise,
      }
    : null;
}

function toDetail(row: LoanRow, today: IsoDate): LoanDetail {
  return {
    ...toDto(row, today),
    schedule: scheduleOf(row, today),
    foreclosure: foreclosureOf(row),
  };
}

async function readLoan(tx: Db | Tx, id: number): Promise<LoanRow> {
  const row = await tx.tractorLoan.findUnique({ where: { id }, include: loanInclude });
  if (!row) throw notFound("Loan", id);
  return row;
}

/** Locks the loan so payments, reversals and closure never act on a stale state. */
async function lockLoan(tx: Tx, id: number): Promise<LoanRow> {
  return readLoan(tx, id);
}

async function assertNoOtherOpenLoan(
  tx: Tx,
  tractorId: number,
  exceptLoanId?: number,
): Promise<void> {
  const open = await tx.tractorLoan.findFirst({
    where: {
      tractorId,
      closedOn: null,
      id: exceptLoanId === undefined ? undefined : { not: exceptLoanId },
    },
  });
  if (open) {
    throw new AppError(
      "CONFLICT",
      `This tractor already has open loan #${String(open.id)} from ${open.lender}`,
    );
  }
}

export async function createLoan(
  db: Db,
  tractorId: number,
  input: LoanCreateInput,
  now: Date,
): Promise<LoanDetail> {
  return db.$transaction(async (tx) => {
    const tractor = await tx.tractor.findUnique({ where: { id: tractorId } });
    if (!tractor) throw notFound("Tractor", tractorId);
    if (!tractor.isActive)
      throw new AppError("CONFLICT", `Tractor ${tractor.regNumber} is inactive`);
    await assertNoOtherOpenLoan(tx, tractorId);

    const created = await tx.tractorLoan.create({
      data: {
        tractorId,
        lender: input.lender,
        emiPaise: input.emiAmount,
        emiDay: input.emiDay,
        firstEmiMonth: toDbDate(monthStart(input.firstEmiMonth)),
        totalInstallments: input.totalInstallments,
        notes: input.notes ?? null,
      },
      include: loanInclude,
    });
    await writeAudit(tx, {
      entity: "TractorLoan",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return toDetail(created, todayIST(now));
  });
}

export async function listLoans(db: Db, query: LoanListQuery, now: Date): Promise<LoanDto[]> {
  const rows = await db.tractorLoan.findMany({
    where: {
      tractorId: query.tractorId,
      closedOn:
        query.status === "open" ? null : query.status === "closed" ? { not: null } : undefined,
    },
    include: loanInclude,
    orderBy: { id: "asc" },
  });
  const today = todayIST(now);
  return rows.map((row) => toDto(row, today));
}

export async function getLoan(db: Db, id: number, now: Date): Promise<LoanDetail> {
  return toDetail(await readLoan(db, id), todayIST(now));
}

export async function updateLoan(
  db: Db,
  id: number,
  input: LoanUpdateInput,
  now: Date,
): Promise<LoanDetail> {
  return db.$transaction(async (tx) => {
    const before = await lockLoan(tx, id);
    const after = await tx.tractorLoan.update({ where: { id }, data: input, include: loanInclude });
    await writeAudit(tx, { entity: "TractorLoan", entityId: id, action: "UPDATE", before, after });
    return toDetail(after, todayIST(now));
  });
}

/** A loan entered by mistake can be removed only while nothing was ever paid on it. */
export async function deleteLoan(db: Db, id: number): Promise<void> {
  await db.$transaction(async (tx) => {
    const before = await lockLoan(tx, id);
    const everPaid = await tx.expense.count({ where: { tractorLoanId: id } });
    if (everPaid > 0) {
      throw new AppError(
        "CONFLICT",
        `Loan #${String(id)} has payment history and cannot be deleted`,
      );
    }
    await tx.tractorLoan.delete({ where: { id } });
    await writeAudit(tx, { entity: "TractorLoan", entityId: id, action: "DELETE", before });
  });
}

function assertMonthInSchedule(loan: LoanRow, month: IsoMonth): void {
  const terms = termsOf(loan);
  const last = lastEmiMonth(terms);
  if (month < terms.firstEmiMonth || month > last) {
    throw new AppError(
      "VALIDATION",
      `${month} is outside this loan's instalments (${terms.firstEmiMonth} to ${last})`,
    );
  }
}

/** Once every instalment is paid the loan closes, dated by the latest of those payments. */
async function closeIfPaidOff(tx: Tx, loan: LoanRow): Promise<void> {
  const instalments = { tractorLoanId: loan.id, deletedAt: null, emiMonth: { not: null } };
  const [paidCount, latest] = await Promise.all([
    tx.expense.count({ where: instalments }),
    tx.expense.aggregate({ where: instalments, _max: { spentOn: true } }),
  ]);
  if (paidCount < loan.totalInstallments) return;
  const after = await tx.tractorLoan.update({
    where: { id: loan.id },
    data: { closedOn: latest._max.spentOn, closedReason: "PAID_OFF" },
  });
  await writeAudit(tx, {
    entity: "TractorLoan",
    entityId: loan.id,
    action: "UPDATE",
    before: loan,
    after,
  });
}

interface LoanPaymentData {
  paidOn: IsoDate;
  amountPaise: number;
  mode: "CASH" | "ONLINE";
  emiMonth: Date | null;
  lateFeePaise: number | null;
  reference: string | null;
  notes: string | null;
}

/** Every loan payment is a TRACTOR_EMI expense on the loan's tractor. */
async function recordLoanPayment(tx: Tx, loan: LoanRow, data: LoanPaymentData): Promise<number> {
  const expense = await tx.expense.create({
    data: {
      category: "TRACTOR_EMI",
      spentOn: toDbDate(data.paidOn),
      amountPaise: data.amountPaise,
      mode: data.mode,
      tractorId: loan.tractorId,
      tractorLoanId: loan.id,
      emiMonth: data.emiMonth,
      lateFeePaise: data.lateFeePaise,
      reference: data.reference,
      notes: data.notes,
    },
  });
  await writeAudit(tx, {
    entity: "Expense",
    entityId: expense.id,
    action: "CREATE",
    after: expense,
  });
  return expense.id;
}

async function paymentSaved(
  tx: Tx,
  loanId: number,
  expenseId: number,
  warnings: string[],
  now: Date,
): Promise<{ statusCode: number; body: LoanPaymentSaved }> {
  return {
    statusCode: 201,
    body: { loan: toDetail(await readLoan(tx, loanId), todayIST(now)), expenseId, warnings },
  };
}

function assertOpen(loan: LoanRow): void {
  if (loan.closedOn) throw new AppError("CONFLICT", `Loan #${String(loan.id)} is already closed`);
}

export async function payEmi(
  db: Db,
  loanId: number,
  input: EmiPaymentInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<LoanPaymentSaved>> {
  const request = { key: idempotencyKey, route: `POST /loans/${String(loanId)}/emi`, body: input };
  return runIdempotent(db, request, async (tx) => {
    assertBusinessDate(input.paidOn, await getBusinessBounds(tx, now));
    const loan = await lockLoan(tx, loanId);
    assertOpen(loan);
    assertMonthInSchedule(loan, input.emiMonth);
    const emiMonth = toDbDate(monthStart(input.emiMonth));
    const already = loan.payments.find(
      (payment) => payment.emiMonth?.getTime() === emiMonth.getTime(),
    );
    if (already) {
      throw new AppError(
        "CONFLICT",
        `The ${input.emiMonth} instalment is already paid (expense #${String(already.id)})`,
      );
    }

    const lateFeePaise = input.lateFee ?? 0;
    const expenseId = await recordLoanPayment(tx, loan, {
      paidOn: input.paidOn,
      amountPaise: input.amount + lateFeePaise,
      mode: input.mode,
      emiMonth,
      lateFeePaise: lateFeePaise > 0 ? lateFeePaise : null,
      reference: input.reference ?? null,
      notes: input.notes ?? null,
    });
    await closeIfPaidOff(tx, loan);

    const warnings =
      input.amount === loan.emiPaise
        ? []
        : [`Paid ${formatPaise(input.amount)}; the EMI is ${formatPaise(loan.emiPaise)}`];
    return paymentSaved(tx, loanId, expenseId, warnings, now);
  });
}

/** Pays off what is left in one go; the remaining instalments are closed. */
export async function forecloseLoan(
  db: Db,
  loanId: number,
  input: ForeclosureInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<LoanPaymentSaved>> {
  const request = {
    key: idempotencyKey,
    route: `POST /loans/${String(loanId)}/foreclose`,
    body: input,
  };
  return runIdempotent(db, request, async (tx) => {
    assertBusinessDate(input.closedOn, await getBusinessBounds(tx, now));
    const loan = await lockLoan(tx, loanId);
    assertOpen(loan);
    const expenseId = await recordLoanPayment(tx, loan, {
      paidOn: input.closedOn,
      amountPaise: input.amount,
      mode: input.mode,
      emiMonth: null,
      lateFeePaise: null,
      reference: input.reference ?? null,
      notes: input.notes ?? "Loan foreclosed",
    });
    const closed = await tx.tractorLoan.update({
      where: { id: loanId },
      data: { closedOn: toDbDate(input.closedOn), closedReason: "FORECLOSED" },
    });
    await writeAudit(tx, {
      entity: "TractorLoan",
      entityId: loanId,
      action: "UPDATE",
      before: loan,
      after: closed,
    });
    return paymentSaved(tx, loanId, expenseId, [], now);
  });
}

/**
 * Reverses a payment entered by mistake. A loan that the payment had closed (paid off, or
 * foreclosed by this very payment) opens again.
 */
export async function reverseLoanPayment(
  db: Db,
  loanId: number,
  expenseId: number,
  now: Date,
): Promise<LoanDetail> {
  return db.$transaction(async (tx) => {
    const loan = await lockLoan(tx, loanId);
    const payment = loan.payments.find((row) => row.id === expenseId);
    if (!payment) throw notFound("Loan payment", expenseId);

    const after = await tx.expense.update({ where: { id: expenseId }, data: { deletedAt: now } });
    await writeAudit(tx, {
      entity: "Expense",
      entityId: expenseId,
      action: "DELETE",
      before: payment,
      after,
    });

    const wasForeclosure = payment.emiMonth === null;
    const reopens =
      (loan.closedReason === "PAID_OFF" && !wasForeclosure) ||
      (loan.closedReason === "FORECLOSED" && wasForeclosure);
    if (reopens) {
      await assertNoOtherOpenLoan(tx, loan.tractorId, loan.id);
      const reopened = await tx.tractorLoan.update({
        where: { id: loanId },
        data: { closedOn: null, closedReason: null },
      });
      await writeAudit(tx, {
        entity: "TractorLoan",
        entityId: loanId,
        action: "UPDATE",
        before: loan,
        after: reopened,
      });
    }
    return toDetail(await readLoan(tx, loanId), todayIST(now));
  });
}

/** Instalments overdue or due within `days` across every open loan, oldest first. */
export async function emiDue(db: Db, query: EmiDueQuery, now: Date): Promise<EmiDue> {
  const today = todayIST(now);
  const loans = await db.tractorLoan.findMany({ where: { closedOn: null }, include: loanInclude });
  const items = loans.flatMap((loan) =>
    scheduleOf(loan, today)
      .filter((instalment) => {
        if (instalment.status === "OVERDUE" || instalment.status === "DUE_TODAY") return true;
        return (
          instalment.status === "UPCOMING" && daysBetween(today, instalment.dueDate) <= query.days
        );
      })
      .map((instalment) => ({
        loan: { id: loan.id, lender: loan.lender },
        tractor: loan.tractor,
        month: instalment.month,
        dueDate: instalment.dueDate,
        status: instalment.status,
        emiPaise: loan.emiPaise,
        daysLate: daysBetween(instalment.dueDate, today),
      })),
  );
  items.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.loan.id - b.loan.id);
  return { asOf: today, items };
}
