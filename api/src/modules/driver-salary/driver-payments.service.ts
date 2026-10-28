import type { Prisma } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { assertExportable, toCsv, type CsvColumn } from "../../lib/csv.ts";
import { assertBusinessDate, dayFilter, monthStart, toDbDate } from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { runIdempotent, type IdempotentResult } from "../../lib/idempotency.ts";
import { lockRow } from "../../lib/locks.ts";
import { paiseToRupeeString } from "../../lib/money.ts";
import { toSkipTake } from "../../lib/pagination.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { getBusinessBounds } from "../settings/settings.service.ts";
import { driverBalance, driverPaymentInclude, toDriverPaymentDto } from "./driver-balance.ts";
import type {
  BonusInput,
  DriverPaymentDto,
  DriverPaymentFilter,
  DriverPaymentInput,
  DriverPaymentListQuery,
  DriverPaymentPage,
  DriverPaymentSaved,
} from "./driver-salary.schema.ts";

/** Old dues are settled even after a driver leaves, so inactive drivers can still be paid. */
async function lockDriver(tx: Tx, driverId: number): Promise<void> {
  await lockRow(tx, "Driver", driverId);
  if (!(await tx.driver.findUnique({ where: { id: driverId } })))
    throw notFound("Driver", driverId);
}

async function saved(tx: Tx, paymentId: number, driverId: number): Promise<DriverPaymentSaved> {
  const payment = await tx.driverPayment.findUniqueOrThrow({
    where: { id: paymentId },
    include: driverPaymentInclude,
  });
  return { payment: toDriverPaymentDto(payment), balancePaise: await driverBalance(tx, driverId) };
}

/** An advance during the month or the salary paid at its end. */
export async function payDriver(
  db: Db,
  driverId: number,
  input: DriverPaymentInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<DriverPaymentSaved>> {
  const request = {
    key: idempotencyKey,
    route: `POST /drivers/${String(driverId)}/payments`,
    body: input,
  };
  return runIdempotent(db, request, async (tx) => {
    assertBusinessDate(input.paidOn, await getBusinessBounds(tx, now));
    await lockDriver(tx, driverId);
    const payment = await tx.driverPayment.create({
      data: {
        driverId,
        paidOn: toDbDate(input.paidOn),
        type: input.type,
        amountPaise: input.amount,
        mode: input.mode,
        forMonth: input.forMonth ? toDbDate(monthStart(input.forMonth)) : null,
        notes: input.notes ?? null,
      },
    });
    await writeAudit(tx, {
      entity: "DriverPayment",
      entityId: payment.id,
      action: "CREATE",
      after: payment,
    });
    return { statusCode: 201, body: await saved(tx, payment.id, driverId) };
  });
}

/** A bonus is earned and paid at once, so it never shows as an amount owed. */
export async function payBonus(
  db: Db,
  driverId: number,
  input: BonusInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<DriverPaymentSaved>> {
  const request = {
    key: idempotencyKey,
    route: `POST /drivers/${String(driverId)}/bonus`,
    body: input,
  };
  return runIdempotent(db, request, async (tx) => {
    assertBusinessDate(input.paidOn, await getBusinessBounds(tx, now));
    await lockDriver(tx, driverId);
    const accrual = await tx.driverAccrual.create({
      data: {
        driverId,
        kind: "BONUS",
        accruedOn: toDbDate(input.paidOn),
        amountPaise: input.amount,
        note: input.note,
      },
    });
    const payment = await tx.driverPayment.create({
      data: {
        driverId,
        paidOn: toDbDate(input.paidOn),
        type: "BONUS",
        amountPaise: input.amount,
        mode: input.mode,
        bonusAccrualId: accrual.id,
        notes: input.note,
      },
    });
    await writeAudit(tx, {
      entity: "DriverAccrual",
      entityId: accrual.id,
      action: "CREATE",
      after: accrual,
    });
    await writeAudit(tx, {
      entity: "DriverPayment",
      entityId: payment.id,
      action: "CREATE",
      after: payment,
    });
    return { statusCode: 201, body: await saved(tx, payment.id, driverId) };
  });
}

/** Removes a payment entered by mistake; a bonus takes its earning with it. */
export async function reverseDriverPayment(
  db: Db,
  id: number,
  now: Date,
): Promise<DriverPaymentSaved> {
  return db.$transaction(async (tx) => {
    const first = await tx.driverPayment.findUnique({ where: { id } });
    if (!first) throw notFound("Driver payment", id);
    await lockRow(tx, "Driver", first.driverId);
    const payment = await tx.driverPayment.findUniqueOrThrow({ where: { id } });
    if (payment.deletedAt)
      throw new AppError("CONFLICT", `Driver payment #${String(id)} is already reversed`);

    const after = await tx.driverPayment.update({ where: { id }, data: { deletedAt: now } });
    await writeAudit(tx, {
      entity: "DriverPayment",
      entityId: id,
      action: "DELETE",
      before: payment,
      after,
    });
    if (payment.bonusAccrualId !== null) {
      const earning = await tx.driverAccrual.findUniqueOrThrow({
        where: { id: payment.bonusAccrualId },
      });
      const removed = await tx.driverAccrual.update({
        where: { id: earning.id },
        data: { deletedAt: now },
      });
      await writeAudit(tx, {
        entity: "DriverAccrual",
        entityId: earning.id,
        action: "DELETE",
        before: earning,
        after: removed,
      });
    }
    return saved(tx, id, payment.driverId);
  });
}

function paymentWhere(filter: DriverPaymentFilter): Prisma.DriverPaymentWhereInput {
  return {
    deletedAt: filter.deleted === "true" ? { not: null } : null,
    driverId: filter.driverId,
    type: filter.type,
    mode: filter.mode,
    paidOn: dayFilter(filter),
  };
}

export async function listDriverPayments(
  db: Db,
  query: DriverPaymentListQuery,
): Promise<DriverPaymentPage> {
  const where = paymentWhere(query);
  // One snapshot, so the page, its count and its totals always agree.
  const [rows, total, groups] = await db.$transaction(
    [
      db.driverPayment.findMany({
        where,
        include: driverPaymentInclude,
        orderBy: [{ paidOn: "desc" }, { id: "desc" }],
        ...toSkipTake(query),
      }),
      db.driverPayment.count({ where }),
      db.driverPayment.groupBy({
        by: ["type"],
        where,
        _sum: { amountPaise: true },
        orderBy: { type: "asc" },
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  const sumFor = (type: "ADVANCE" | "SALARY" | "BONUS") =>
    groups.find((group) => group.type === type)?._sum.amountPaise ?? 0;
  return {
    items: rows.map(toDriverPaymentDto),
    total,
    page: query.page,
    limit: query.limit,
    totals: {
      advancePaise: sumFor("ADVANCE"),
      salaryPaise: sumFor("SALARY"),
      bonusPaise: sumFor("BONUS"),
    },
  };
}

const exportColumns: CsvColumn<DriverPaymentDto>[] = [
  { header: "Payment #", value: (row) => row.id },
  { header: "Date", value: (row) => row.paidOn },
  { header: "Driver", value: (row) => row.driver.name },
  { header: "Type", value: (row) => row.type },
  { header: "Amount (Rs)", value: (row) => paiseToRupeeString(row.amountPaise) },
  { header: "Mode", value: (row) => row.mode },
  { header: "For month", value: (row) => row.forMonth },
  { header: "Notes", value: (row) => row.notes },
];

export async function exportDriverPayments(db: Db, filter: DriverPaymentFilter): Promise<string> {
  const where = paymentWhere(filter);
  const count = await db.driverPayment.count({ where });
  assertExportable(count, "payments");
  const rows = await db.driverPayment.findMany({
    where,
    include: driverPaymentInclude,
    orderBy: [{ paidOn: "asc" }, { id: "asc" }],
  });
  return toCsv(exportColumns, rows.map(toDriverPaymentDto));
}
