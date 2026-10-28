import type { Prisma } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { assertExportable, toCsv, type CsvColumn } from "../../lib/csv.ts";
import { assertBusinessDate, fromDbDate, toDbDate, dayFilter } from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { runIdempotent, type IdempotentResult } from "../../lib/idempotency.ts";
import { lockRow } from "../../lib/locks.ts";
import { formatPaise, paiseToRupeeString } from "../../lib/money.ts";
import { toSkipTake } from "../../lib/pagination.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { customerBalance } from "../customer-ledger/balance.ts";
import { getBusinessBounds } from "../settings/settings.service.ts";
import { assertReferenceFree } from "../trips/trips.service.ts";
import {
  checkManualPlan,
  planFifo,
  sumLines,
  type AllocationLine,
  type DueTrip,
} from "./allocation.ts";
import type {
  AllocationInput,
  CreditApplied,
  PaymentCreateInput,
  PaymentDto,
  PaymentFilter,
  PaymentListQuery,
  PaymentPage,
  PaymentSaved,
  PaymentUpdateInput,
} from "./payments.schema.ts";

const paymentInclude = {
  customer: { select: { id: true, name: true } },
  allocations: {
    include: { trip: { select: { tripDate: true, kind: true } } },
    orderBy: { id: "asc" },
  },
} as const satisfies Prisma.CustomerPaymentInclude;
type PaymentRow = Prisma.CustomerPaymentGetPayload<{ include: typeof paymentInclude }>;

function toDto(row: PaymentRow): PaymentDto {
  return {
    id: row.id,
    customer: row.customer,
    paidOn: fromDbDate(row.paidOn),
    kind: row.kind,
    mode: row.mode,
    amountPaise: row.amountPaise,
    allocatedPaise: row.allocatedPaise,
    unallocatedPaise: row.amountPaise - row.allocatedPaise,
    reference: row.reference,
    notes: row.notes,
    deliveryTripId: row.deliveryTripId,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    allocations: row.allocations.map((line) => ({
      tripId: line.tripId,
      tripDate: fromDbDate(line.trip.tripDate),
      tripKind: line.trip.kind,
      amountPaise: line.amountPaise,
    })),
  };
}

/** A customer's unpaid trips, oldest first: the carried-over register due, then by date. */
async function openDues(tx: Tx, customerId: number): Promise<DueTrip[]> {
  const trips = await tx.trip.findMany({
    where: {
      customerId,
      deletedAt: null,
      receivedPaise: { lt: tx.trip.fields.amountPaise },
    },
    orderBy: [{ tripDate: "asc" }, { id: "asc" }],
    select: { id: true, kind: true, amountPaise: true, receivedPaise: true },
  });
  // Postgres sorts enums by declaration order (TRIP first), so put the register due first here.
  const registerFirst = [
    ...trips.filter((trip) => trip.kind === "OPENING_BALANCE"),
    ...trips.filter((trip) => trip.kind === "TRIP"),
  ];
  return registerFirst.map((trip) => ({
    tripId: trip.id,
    duePaise: trip.amountPaise - trip.receivedPaise,
  }));
}

function planAllocation(
  dues: readonly DueTrip[],
  allocation: AllocationInput,
  amountPaise: number,
): AllocationLine[] {
  if (allocation.strategy === "AUTO") return planFifo(dues, amountPaise);
  const lines = allocation.items.map((item) => ({ tripId: item.tripId, amountPaise: item.amount }));
  checkManualPlan(new Map(dues.map((due) => [due.tripId, due.duePaise])), lines, amountPaise);
  return lines;
}

/**
 * Only what the customer still owes after their unused credit can be forgiven; writing
 * off a due their own advance covers would leave the business owing money it never got.
 */
async function assertWriteOffWithinBalance(
  tx: Tx,
  customerId: number,
  amountPaise: number,
): Promise<void> {
  const balance = await customerBalance(tx, customerId);
  if (amountPaise <= balance.balancePaise) return;
  const owed = formatPaise(Math.max(balance.balancePaise, 0));
  throw new AppError(
    "CONFLICT",
    balance.creditPaise > 0
      ? `The customer owes ${owed} after ${formatPaise(balance.creditPaise)} unused credit; apply the credit first`
      : `The customer owes only ${owed}`,
    { balancePaise: balance.balancePaise, creditPaise: balance.creditPaise },
  );
}

/** A write-off forgives specific dues; it can never stand as credit. */
function assertWriteOffCovered(input: PaymentCreateInput, lines: readonly AllocationLine[]): void {
  if (input.kind === "WRITE_OFF" && sumLines(lines) !== input.amount) {
    throw new AppError("VALIDATION", "A write-off must be set in full against trips");
  }
}

export async function createPayment(
  db: Db,
  customerId: number,
  input: PaymentCreateInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<PaymentSaved>> {
  const request = {
    key: idempotencyKey,
    route: `POST /customers/${String(customerId)}/payments`,
    body: input,
  };
  return runIdempotent(db, request, async (tx) => {
    assertBusinessDate(input.paidOn, await getBusinessBounds(tx, now));
    await lockRow(tx, "Customer", customerId);
    // Old dues may be cleared even after a customer is made inactive.
    if (!(await tx.customer.findUnique({ where: { id: customerId } }))) {
      throw notFound("Customer", customerId);
    }
    const reference = input.kind === "PAYMENT" ? (input.reference ?? null) : null;
    if (reference) await assertReferenceFree(tx, reference);

    if (input.kind === "WRITE_OFF") await assertWriteOffWithinBalance(tx, customerId, input.amount);
    const dues = await openDues(tx, customerId);
    const lines = planAllocation(dues, input.allocation, input.amount);
    assertWriteOffCovered(input, lines);

    const created = await tx.customerPayment.create({
      data: {
        customerId,
        paidOn: toDbDate(input.paidOn),
        kind: input.kind,
        mode: input.kind === "PAYMENT" ? input.mode : null,
        amountPaise: input.amount,
        reference,
        notes: input.notes ?? null,
        allocations: { create: lines },
      },
      include: paymentInclude,
    });
    await writeAudit(tx, {
      entity: "CustomerPayment",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return {
      statusCode: 201,
      body: { payment: toDto(created), customerBalance: await customerBalance(tx, customerId) },
    };
  });
}

/** Sets money the customer paid earlier (and was not yet used) against open dues. */
export async function applyCredit(
  db: Db,
  customerId: number,
  idempotencyKey: string,
): Promise<IdempotentResult<CreditApplied>> {
  const request = {
    key: idempotencyKey,
    route: `POST /customers/${String(customerId)}/apply-credit`,
    body: {},
  };
  return runIdempotent(db, request, async (tx) => {
    await lockRow(tx, "Customer", customerId);
    if (!(await tx.customer.findUnique({ where: { id: customerId } }))) {
      throw notFound("Customer", customerId);
    }
    const credits = await tx.customerPayment.findMany({
      where: {
        customerId,
        kind: "PAYMENT",
        deletedAt: null,
        allocatedPaise: { lt: tx.customerPayment.fields.amountPaise },
      },
      orderBy: [{ paidOn: "asc" }, { id: "asc" }],
    });

    let dues = await openDues(tx, customerId);
    const applied: CreditApplied["allocations"] = [];
    for (const credit of credits) {
      const lines = planFifo(dues, credit.amountPaise - credit.allocatedPaise);
      if (lines.length === 0) break;
      await tx.paymentAllocation.createMany({
        data: lines.map((line) => ({ ...line, paymentId: credit.id })),
      });
      await writeAudit(tx, {
        entity: "CustomerPayment",
        entityId: credit.id,
        action: "UPDATE",
        before: { allocatedPaise: credit.allocatedPaise },
        after: { appliedToTrips: lines },
      });
      applied.push(...lines.map((line) => ({ ...line, paymentId: credit.id })));
      dues = await openDues(tx, customerId);
    }
    return {
      statusCode: 200,
      body: { allocations: applied, customerBalance: await customerBalance(tx, customerId) },
    };
  });
}

/** Locks the payment's customer, then reads the payment as it stands under that lock. */
async function lockPayment(tx: Tx, id: number): Promise<PaymentRow> {
  const first = await tx.customerPayment.findUnique({ where: { id } });
  if (!first) throw notFound("Payment", id);
  await lockRow(tx, "Customer", first.customerId);
  return tx.customerPayment.findUniqueOrThrow({ where: { id }, include: paymentInclude });
}

/**
 * Reverses a payment entered by mistake: its allocations are removed, so the trips it
 * paid are due again, and the payment stops counting.
 */
export async function reversePayment(db: Db, id: number, now: Date): Promise<PaymentSaved> {
  return db.$transaction(async (tx) => {
    const before = await lockPayment(tx, id);
    if (before.deletedAt)
      throw new AppError("CONFLICT", `Payment #${String(id)} is already reversed`);
    await tx.paymentAllocation.deleteMany({ where: { paymentId: id } });
    const after = await tx.customerPayment.update({
      where: { id },
      data: { deletedAt: now },
      include: paymentInclude,
    });
    await writeAudit(tx, {
      entity: "CustomerPayment",
      entityId: id,
      action: "DELETE",
      before,
      after,
    });
    return { payment: toDto(after), customerBalance: await customerBalance(tx, after.customerId) };
  });
}

/** Corrects how or when money came in. The amount itself is changed by reversing. */
export async function updatePayment(
  db: Db,
  id: number,
  input: PaymentUpdateInput,
  now: Date,
): Promise<PaymentSaved> {
  return db.$transaction(async (tx) => {
    const before = await lockPayment(tx, id);
    if (before.deletedAt) throw new AppError("CONFLICT", `Payment #${String(id)} is reversed`);
    if (
      before.kind === "WRITE_OFF" &&
      (input.mode !== undefined || input.reference !== undefined)
    ) {
      throw new AppError("VALIDATION", "A write-off has no payment mode or reference");
    }
    if (input.paidOn && before.deliveryTripId !== null) {
      throw new AppError(
        "CONFLICT",
        `This money was taken at delivery of trip #${String(before.deliveryTripId)}; change the trip's date instead`,
      );
    }
    if (input.paidOn) assertBusinessDate(input.paidOn, await getBusinessBounds(tx, now));
    if (input.reference && input.reference !== before.reference) {
      await assertReferenceFree(tx, input.reference);
    }

    const after = await tx.customerPayment.update({
      where: { id },
      data: {
        paidOn: input.paidOn && toDbDate(input.paidOn),
        mode: input.mode,
        reference: input.reference,
        notes: input.notes,
      },
      include: paymentInclude,
    });
    await writeAudit(tx, {
      entity: "CustomerPayment",
      entityId: id,
      action: "UPDATE",
      before,
      after,
    });
    return { payment: toDto(after), customerBalance: await customerBalance(tx, after.customerId) };
  });
}

export async function getPayment(db: Db, id: number): Promise<PaymentDto> {
  const row = await db.customerPayment.findUnique({ where: { id }, include: paymentInclude });
  if (!row) throw notFound("Payment", id);
  return toDto(row);
}

function paymentWhere(filter: PaymentFilter): Prisma.CustomerPaymentWhereInput {
  const where: Prisma.CustomerPaymentWhereInput = {
    deletedAt: filter.deleted === "true" ? { not: null } : null,
    customerId: filter.customerId,
    kind: filter.kind,
    mode: filter.mode,
  };
  where.paidOn = dayFilter(filter);
  return where;
}

export async function listPayments(db: Db, query: PaymentListQuery): Promise<PaymentPage> {
  const where = paymentWhere(query);
  // One snapshot, so the page, its count and its totals always agree.
  const [rows, total, groups] = await db.$transaction(
    [
      db.customerPayment.findMany({
        where,
        include: paymentInclude,
        orderBy: [{ paidOn: "desc" }, { id: "desc" }],
        ...toSkipTake(query),
      }),
      db.customerPayment.count({ where }),
      db.customerPayment.groupBy({
        by: ["kind", "mode"],
        where,
        _sum: { amountPaise: true },
        orderBy: [{ kind: "asc" }, { mode: "asc" }],
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  const sumFor = (kind: "PAYMENT" | "WRITE_OFF", mode: "CASH" | "ONLINE" | null) =>
    groups.find((group) => group.kind === kind && group.mode === mode)?._sum.amountPaise ?? 0;
  return {
    items: rows.map(toDto),
    total,
    page: query.page,
    limit: query.limit,
    totals: {
      cashPaise: sumFor("PAYMENT", "CASH"),
      onlinePaise: sumFor("PAYMENT", "ONLINE"),
      writeOffPaise: sumFor("WRITE_OFF", null),
    },
  };
}

const exportColumns: CsvColumn<PaymentDto>[] = [
  { header: "Payment #", value: (payment) => payment.id },
  { header: "Date", value: (payment) => payment.paidOn },
  { header: "Customer", value: (payment) => payment.customer.name },
  { header: "Kind", value: (payment) => payment.kind },
  { header: "Mode", value: (payment) => payment.mode },
  { header: "Amount (Rs)", value: (payment) => paiseToRupeeString(payment.amountPaise) },
  {
    header: "Unused credit (Rs)",
    value: (payment) => paiseToRupeeString(payment.unallocatedPaise),
  },
  { header: "Reference", value: (payment) => payment.reference },
  {
    header: "Trips paid",
    value: (payment) => payment.allocations.map((line) => `#${String(line.tripId)}`).join(" "),
  },
  { header: "Notes", value: (payment) => payment.notes },
];

export async function exportPayments(db: Db, filter: PaymentFilter): Promise<string> {
  const where = paymentWhere(filter);
  const count = await db.customerPayment.count({ where });
  assertExportable(count, "payments");
  const rows = await db.customerPayment.findMany({
    where,
    include: paymentInclude,
    orderBy: [{ paidOn: "asc" }, { id: "asc" }],
  });
  return toCsv(exportColumns, rows.map(toDto));
}
