import type { Driver, DriverSalaryRate } from "#prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { fromDbDate, monthOf, monthStart, toDbDate, type IsoMonth } from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { runIdempotent, type IdempotentResult } from "../../lib/idempotency.ts";
import { formatPaise } from "../../lib/money.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { getBusinessBounds } from "../settings/settings.service.ts";
import { driverBalance, toAccrualDto } from "./driver-balance.ts";
import type {
  AccrualSaved,
  CloseMonthInput,
  DriverOpeningInput,
  SalaryPreview,
} from "./driver-salary.schema.ts";
import { lastDayOf, prorate, rateFor } from "./salary-calc.ts";

type DriverWithRates = Driver & { salaryRates: DriverSalaryRate[] };

async function readDriver(tx: Db | Tx, driverId: number): Promise<DriverWithRates> {
  const driver = await tx.driver.findUnique({
    where: { id: driverId },
    include: { salaryRates: true },
  });
  if (!driver) throw notFound("Driver", driverId);
  return driver;
}

function suggestion(driver: DriverWithRates, month: IsoMonth) {
  const rate = rateFor(
    driver.salaryRates.map((row) => ({
      effectiveFrom: monthOf(fromDbDate(row.effectiveFrom)),
      monthlyPaise: row.monthlyPaise,
    })),
    month,
  );
  const joinedOn = fromDbDate(driver.joinedOn);
  const leftOn = driver.leftOn ? fromDbDate(driver.leftOn) : null;
  return { rate, proration: rate === null ? null : prorate(rate, month, joinedOn, leftOn) };
}

async function closedMonth(tx: Db | Tx, driverId: number, month: IsoMonth) {
  return tx.driverAccrual.findFirst({
    where: { driverId, kind: "MONTH_SALARY", month: toDbDate(monthStart(month)), deletedAt: null },
  });
}

/** What closing a month would record: the rate, the days worked and the prorated salary. */
export async function salaryPreview(
  db: Db,
  driverId: number,
  month: IsoMonth,
): Promise<SalaryPreview> {
  const driver = await readDriver(db, driverId);
  const { rate, proration } = suggestion(driver, month);
  const closed = await closedMonth(db, driverId, month);
  return {
    month,
    monthlyPaise: rate,
    daysInMonth: proration?.daysInMonth ?? 0,
    daysWorked: proration?.daysWorked ?? 0,
    suggestedPaise: proration?.amountPaise ?? null,
    closed: closed ? toAccrualDto(closed) : null,
  };
}

function assertMonthClosable(
  driver: DriverWithRates,
  month: IsoMonth,
  bounds: { businessStartDate: string; today: string },
): void {
  const joinMonth = monthOf(fromDbDate(driver.joinedOn));
  const leaveMonth = driver.leftOn ? monthOf(fromDbDate(driver.leftOn)) : null;
  const startMonth = bounds.businessStartDate.slice(0, 7);
  if (month >= bounds.today.slice(0, 7)) {
    throw new AppError("CONFLICT", `${month} is not over yet; close it after the month ends`);
  }
  if (month < joinMonth) throw new AppError("CONFLICT", `${driver.name} joined in ${joinMonth}`);
  if (leaveMonth && month > leaveMonth) {
    throw new AppError("CONFLICT", `${driver.name} left in ${leaveMonth}`);
  }
  if (month < startMonth) {
    throw new AppError(
      "CONFLICT",
      `${month} is before the business start; carry older salary as the driver's opening balance`,
    );
  }
}

/** Records the salary a driver earned for a finished month. */
export async function closeMonth(
  db: Db,
  driverId: number,
  input: CloseMonthInput,
  now: Date,
): Promise<AccrualSaved> {
  return db.$transaction(async (tx) => {
    const bounds = await getBusinessBounds(tx, now);
    const driver = await readDriver(tx, driverId);
    assertMonthClosable(driver, input.month, bounds);
    const existing = await closedMonth(tx, driverId, input.month);
    if (existing) {
      throw new AppError(
        "CONFLICT",
        `${input.month} is already closed at ${formatPaise(existing.amountPaise)}`,
      );
    }

    const { proration } = suggestion(driver, input.month);
    if (!proration)
      throw new Error(`Driver ${String(driverId)} has no salary rate for ${input.month}`);
    const amountPaise = input.amount ?? proration.amountPaise;
    if (amountPaise !== proration.amountPaise && !input.note) {
      throw new AppError(
        "VALIDATION",
        `The salary for ${input.month} works out to ${formatPaise(proration.amountPaise)}; add a note to record a different amount`,
      );
    }

    const accrual = await tx.driverAccrual.create({
      data: {
        driverId,
        kind: "MONTH_SALARY",
        month: toDbDate(monthStart(input.month)),
        accruedOn: toDbDate(lastDayOf(input.month)),
        amountPaise,
        note: input.note ?? null,
      },
    });
    await writeAudit(tx, {
      entity: "DriverAccrual",
      entityId: accrual.id,
      action: "CREATE",
      after: accrual,
    });
    return { accrual: toAccrualDto(accrual), balancePaise: await driverBalance(tx, driverId) };
  });
}

/** Undoes a month close entered wrongly, so it can be closed again. */
export async function reopenMonth(
  db: Db,
  driverId: number,
  month: IsoMonth,
  now: Date,
): Promise<AccrualSaved> {
  return db.$transaction(async (tx) => {
    await readDriver(tx, driverId);
    const accrual = await closedMonth(tx, driverId, month);
    if (!accrual) throw new AppError("NOT_FOUND", `${month} is not closed`);
    const after = await tx.driverAccrual.update({
      where: { id: accrual.id },
      data: { deletedAt: now },
    });
    await writeAudit(tx, {
      entity: "DriverAccrual",
      entityId: accrual.id,
      action: "DELETE",
      before: accrual,
      after,
    });
    return { accrual: toAccrualDto(after), balancePaise: await driverBalance(tx, driverId) };
  });
}

/** What the driver was owed, or held as advance, in the paper register; recorded once. */
export async function setDriverOpening(
  db: Db,
  driverId: number,
  input: DriverOpeningInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<AccrualSaved>> {
  const request = {
    key: idempotencyKey,
    route: `POST /drivers/${String(driverId)}/opening-balance`,
    body: input,
  };
  return runIdempotent(db, request, async (tx) => {
    const bounds = await getBusinessBounds(tx, now);
    const driver = await readDriver(tx, driverId);
    const existing = await tx.driverAccrual.findFirst({
      where: { driverId, kind: "OPENING_BALANCE", deletedAt: null },
    });
    if (existing) throw new AppError("CONFLICT", `${driver.name} already has an opening balance`);
    const accrual = await tx.driverAccrual.create({
      data: {
        driverId,
        kind: "OPENING_BALANCE",
        accruedOn: toDbDate(bounds.businessStartDate),
        amountPaise: input.amount,
        note: input.note ?? null,
      },
    });
    await writeAudit(tx, {
      entity: "DriverAccrual",
      entityId: accrual.id,
      action: "CREATE",
      after: accrual,
    });
    return {
      statusCode: 201,
      body: { accrual: toAccrualDto(accrual), balancePaise: await driverBalance(tx, driverId) },
    };
  });
}

/** Removes an opening balance entered wrongly, so the right one can be entered. */
export async function removeDriverOpening(
  db: Db,
  driverId: number,
  now: Date,
): Promise<AccrualSaved> {
  return db.$transaction(async (tx) => {
    await readDriver(tx, driverId);
    const opening = await tx.driverAccrual.findFirst({
      where: { driverId, kind: "OPENING_BALANCE", deletedAt: null },
    });
    if (!opening) throw new AppError("NOT_FOUND", "This driver has no opening balance");
    const after = await tx.driverAccrual.update({
      where: { id: opening.id },
      data: { deletedAt: now },
    });
    await writeAudit(tx, {
      entity: "DriverAccrual",
      entityId: opening.id,
      action: "DELETE",
      before: opening,
      after,
    });
    return { accrual: toAccrualDto(after), balancePaise: await driverBalance(tx, driverId) };
  });
}
