import type { Prisma } from "#prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { assertExportable, toCsv, type CsvColumn } from "../../lib/csv.ts";
import {
  assertBusinessDate,
  fromDbDate,
  toDbDate,
  type IsoDate,
  dayFilter,
} from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { runIdempotent, type IdempotentResult } from "../../lib/idempotency.ts";
import { formatPaise, paiseToRupeeString } from "../../lib/money.ts";
import { toSkipTake } from "../../lib/pagination.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { customerBalance } from "../customer-ledger/balance.ts";
import { getBusinessBounds } from "../settings/settings.service.ts";
import { checkTripMasters } from "./trip-masters.ts";
import type {
  TripCreateInput,
  TripDeleted,
  TripDto,
  TripFilter,
  TripListQuery,
  TripPage,
  TripPaymentInput,
  TripSaved,
  TripStatus,
  TripUpdateInput,
} from "./trips.schema.ts";

export const tripInclude = {
  customer: { select: { id: true, name: true } },
  driver: { select: { id: true, name: true } },
  tractor: { select: { id: true, regNumber: true } },
  khet: { select: { id: true, name: true } },
} as const satisfies Prisma.TripInclude;
export type TripRow = Prisma.TripGetPayload<{ include: typeof tripInclude }>;

export function statusOf(amountPaise: number, receivedPaise: number): TripStatus {
  if (receivedPaise === 0) return "DUE";
  return receivedPaise < amountPaise ? "PARTIAL" : "PAID";
}

export function toTripDto(row: TripRow): TripDto {
  return {
    id: row.id,
    kind: row.kind,
    tripDate: fromDbDate(row.tripDate),
    customer: row.customer,
    driver: row.driver,
    tractor: row.tractor,
    khet: row.khet,
    amountPaise: row.amountPaise,
    receivedPaise: row.receivedPaise,
    duePaise: row.amountPaise - row.receivedPaise,
    status: statusOf(row.amountPaise, row.receivedPaise),
    quantityNote: row.quantityNote,
    notes: row.notes,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Paid now, in paise, from the payment choice made when the trip was entered. */
function paidAtDelivery(payment: TripPaymentInput, amountPaise: number): number {
  switch (payment.type) {
    case "DUE":
      return 0;
    case "CASH":
    case "ONLINE":
      return amountPaise;
    case "PARTIAL":
      if (payment.paidAmount >= amountPaise) {
        throw new AppError(
          "VALIDATION",
          "A partial payment must be less than the trip amount; choose CASH or ONLINE for full payment",
        );
      }
      return payment.paidAmount;
  }
}

function modeOf(payment: TripPaymentInput): "CASH" | "ONLINE" | null {
  if (payment.type === "DUE") return null;
  if (payment.type === "PARTIAL") return payment.mode;
  return payment.type;
}

function referenceOf(payment: TripPaymentInput): string | null {
  return payment.type === "ONLINE" || payment.type === "PARTIAL"
    ? (payment.reference ?? null)
    : null;
}

export async function createTrip(
  db: Db,
  input: TripCreateInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<TripSaved>> {
  return runIdempotent(
    db,
    { key: idempotencyKey, route: "POST /trips", body: input },
    async (tx) => {
      assertBusinessDate(input.tripDate, await getBusinessBounds(tx, now));
      const warnings = await checkTripMasters(tx, input);
      const paidPaise = paidAtDelivery(input.payment, input.amount);

      const trip = await tx.trip.create({
        data: {
          tripDate: toDbDate(input.tripDate),
          customerId: input.customerId,
          driverId: input.driverId,
          tractorId: input.tractorId,
          khetId: input.khetId,
          amountPaise: input.amount,
          quantityNote: input.quantityNote ?? null,
          notes: input.notes ?? null,
        },
      });
      await writeAudit(tx, { entity: "Trip", entityId: trip.id, action: "CREATE", after: trip });

      const mode = modeOf(input.payment);
      if (paidPaise > 0 && mode) {
        await recordPaymentAtDelivery(tx, {
          customerId: input.customerId,
          tripId: trip.id,
          paidOn: input.tripDate,
          amountPaise: paidPaise,
          mode,
          reference: referenceOf(input.payment),
        });
      }

      const saved = await tx.trip.findUniqueOrThrow({
        where: { id: trip.id },
        include: tripInclude,
      });
      return {
        statusCode: 201,
        body: {
          trip: toTripDto(saved),
          customerBalance: await customerBalance(tx, input.customerId),
          warnings,
        },
      };
    },
  );
}

async function recordPaymentAtDelivery(
  tx: Tx,
  payment: {
    customerId: number;
    tripId: number;
    paidOn: IsoDate;
    amountPaise: number;
    mode: "CASH" | "ONLINE";
    reference: string | null;
  },
): Promise<void> {
  if (payment.reference) await assertReferenceFree(tx, payment.reference);
  const created = await tx.customerPayment.create({
    data: {
      customerId: payment.customerId,
      paidOn: toDbDate(payment.paidOn),
      kind: "PAYMENT",
      mode: payment.mode,
      amountPaise: payment.amountPaise,
      reference: payment.reference,
      deliveryTripId: payment.tripId,
      allocations: { create: { tripId: payment.tripId, amountPaise: payment.amountPaise } },
    },
  });
  await writeAudit(tx, {
    entity: "CustomerPayment",
    entityId: created.id,
    action: "CREATE",
    after: {
      ...created,
      allocations: [{ tripId: payment.tripId, amountPaise: payment.amountPaise }],
    },
  });
}

export async function assertReferenceFree(tx: Tx, reference: string): Promise<void> {
  const existing = await tx.customerPayment.findFirst({ where: { reference, deletedAt: null } });
  if (existing) {
    throw new AppError(
      "CONFLICT",
      `Payment reference ${reference} is already recorded as payment #${String(existing.id)}`,
    );
  }
}

export function tripWhere(filter: TripFilter, db: Db): Prisma.TripWhereInput {
  const where: Prisma.TripWhereInput = {
    deletedAt: filter.deleted === "true" ? { not: null } : null,
    customerId: filter.customerId,
    driverId: filter.driverId,
    tractorId: filter.tractorId,
    khetId: filter.khetId,
    kind: filter.kind,
  };
  where.tripDate = dayFilter(filter);
  const amount = db.trip.fields.amountPaise;
  if (filter.status === "DUE") where.receivedPaise = 0;
  if (filter.status === "PAID") where.receivedPaise = { equals: amount };
  if (filter.status === "PARTIAL")
    where.AND = [{ receivedPaise: { gt: 0 } }, { receivedPaise: { lt: amount } }];
  return where;
}

export async function listTrips(db: Db, query: TripListQuery): Promise<TripPage> {
  const where = tripWhere(query, db);
  // One snapshot, so the page, its count and its totals always agree.
  const [rows, total, sums] = await db.$transaction([
    db.trip.findMany({
      where,
      include: tripInclude,
      orderBy: [{ tripDate: "desc" }, { id: "desc" }],
      ...toSkipTake(query),
    }),
    db.trip.count({ where }),
    db.trip.aggregate({ where, _sum: { amountPaise: true, receivedPaise: true } }),
  ]);
  const amountPaise = sums._sum.amountPaise ?? 0;
  const receivedPaise = sums._sum.receivedPaise ?? 0;
  return {
    items: rows.map(toTripDto),
    total,
    page: query.page,
    limit: query.limit,
    totals: { count: total, amountPaise, receivedPaise, duePaise: amountPaise - receivedPaise },
  };
}

const exportColumns: CsvColumn<TripDto>[] = [
  { header: "Trip #", value: (trip) => trip.id },
  { header: "Date", value: (trip) => trip.tripDate },
  { header: "Kind", value: (trip) => trip.kind },
  { header: "Customer", value: (trip) => trip.customer.name },
  { header: "Driver", value: (trip) => trip.driver?.name ?? null },
  { header: "Tractor", value: (trip) => trip.tractor?.regNumber ?? null },
  { header: "Khet", value: (trip) => trip.khet?.name ?? null },
  { header: "Amount (Rs)", value: (trip) => paiseToRupeeString(trip.amountPaise) },
  { header: "Received (Rs)", value: (trip) => paiseToRupeeString(trip.receivedPaise) },
  { header: "Due (Rs)", value: (trip) => paiseToRupeeString(trip.duePaise) },
  { header: "Status", value: (trip) => trip.status },
  { header: "Quantity", value: (trip) => trip.quantityNote },
  { header: "Notes", value: (trip) => trip.notes },
];

export async function exportTrips(db: Db, filter: TripFilter): Promise<string> {
  const where = tripWhere(filter, db);
  const count = await db.trip.count({ where });
  assertExportable(count, "trips");
  const rows = await db.trip.findMany({
    where,
    include: tripInclude,
    orderBy: [{ tripDate: "asc" }, { id: "asc" }],
  });
  return toCsv(exportColumns, rows.map(toTripDto));
}

export async function getTrip(db: Db, id: number): Promise<TripDto> {
  const row = await db.trip.findUnique({ where: { id }, include: tripInclude });
  if (!row) throw notFound("Trip", id);
  return toTripDto(row);
}

/**
 * Reads a trip after locking its customer, so payments being set against it cannot
 * change what was received while this request decides.
 */
async function lockTrip(tx: Tx, id: number, alsoLockCustomer?: number): Promise<TripRow> {
  const first = await tx.trip.findUnique({ where: { id } });
  if (!first) throw notFound("Trip", id);
  const customers = [...new Set([first.customerId, alsoLockCustomer ?? first.customerId])].sort(
    (a, b) => a - b,
  );
  const locked = await tx.trip.findUniqueOrThrow({ where: { id }, include: tripInclude });
  if (!customers.includes(locked.customerId)) {
    throw new AppError(
      "CONFLICT",
      `Trip #${String(id)} was just moved to another customer; try again`,
    );
  }
  return locked;
}

export async function updateTrip(
  db: Db,
  id: number,
  input: TripUpdateInput,
  now: Date,
): Promise<TripSaved> {
  return db.$transaction(async (tx) => {
    const before = await lockTrip(tx, id, input.customerId);
    if (before.deletedAt)
      throw new AppError("CONFLICT", `Trip #${String(id)} is deleted; restore it first`);
    if (input.tripDate) assertBusinessDate(input.tripDate, await getBusinessBounds(tx, now));
    assertAmountCoversReceived(before, input.amount);

    const warnings =
      before.kind === "OPENING_BALANCE"
        ? assertOpeningBalanceEdit(input)
        : await checkTripEdit(tx, before, input);

    const after = await tx.trip.update({
      where: { id },
      data: {
        tripDate: input.tripDate && toDbDate(input.tripDate),
        customerId: input.customerId,
        driverId: input.driverId,
        tractorId: input.tractorId,
        khetId: input.khetId,
        amountPaise: input.amount,
        quantityNote: input.quantityNote,
        notes: input.notes,
      },
      include: tripInclude,
    });
    await writeAudit(tx, { entity: "Trip", entityId: id, action: "UPDATE", before, after });
    if (input.tripDate) await moveDeliveryPayment(tx, id, input.tripDate);
    return {
      trip: toTripDto(after),
      customerBalance: await customerBalance(tx, after.customerId),
      warnings,
    };
  });
}

/** Money taken at delivery was received on the delivery day, so it follows a date fix. */
async function moveDeliveryPayment(tx: Tx, tripId: number, tripDate: IsoDate): Promise<void> {
  const payment = await tx.customerPayment.findUnique({ where: { deliveryTripId: tripId } });
  if (!payment || payment.deletedAt) return;
  const after = await tx.customerPayment.update({
    where: { id: payment.id },
    data: { paidOn: toDbDate(tripDate) },
  });
  await writeAudit(tx, {
    entity: "CustomerPayment",
    entityId: payment.id,
    action: "UPDATE",
    before: payment,
    after,
  });
}

function assertAmountCoversReceived(trip: TripRow, amount: number | undefined): void {
  if (amount !== undefined && amount < trip.receivedPaise) {
    throw new AppError(
      "CONFLICT",
      `${formatPaise(trip.receivedPaise)} is already received for trip #${String(trip.id)}; the amount cannot go below it`,
      { receivedPaise: trip.receivedPaise },
    );
  }
}

/** An opening balance is an amount carried over; it has no date, driver, tractor or khet to edit. */
function assertOpeningBalanceEdit(input: TripUpdateInput): string[] {
  const editable = new Set(["amount", "notes"]);
  const other = Object.keys(input).filter((field) => !editable.has(field));
  if (other.length > 0) {
    throw new AppError(
      "VALIDATION",
      `An opening balance only takes amount and notes, not ${other.join(", ")}`,
    );
  }
  return [];
}

async function checkTripEdit(tx: Tx, before: TripRow, input: TripUpdateInput): Promise<string[]> {
  const customerChanges = input.customerId !== undefined && input.customerId !== before.customerId;
  if (customerChanges && before.receivedPaise > 0) {
    throw new AppError(
      "CONFLICT",
      `Trip #${String(before.id)} has payments set against it; reverse them before moving it to another customer`,
    );
  }
  const { driverId, tractorId, khetId } = before;
  if (driverId === null || tractorId === null || khetId === null) {
    throw new Error(`Trip #${String(before.id)} of kind TRIP is missing a driver, tractor or khet`);
  }
  const previous = { customerId: before.customerId, driverId, tractorId, khetId };
  return checkTripMasters(
    tx,
    {
      customerId: input.customerId ?? previous.customerId,
      driverId: input.driverId ?? previous.driverId,
      tractorId: input.tractorId ?? previous.tractorId,
      khetId: input.khetId ?? previous.khetId,
    },
    previous,
  );
}

/**
 * Soft-deletes a trip. Money already received for it is either a reason to refuse or,
 * when the owner says so, released back to the customer as credit.
 */
export async function deleteTrip(
  db: Db,
  id: number,
  releasePayments: boolean,
  now: Date,
): Promise<TripDeleted> {
  return db.$transaction(async (tx) => {
    const before = await lockTrip(tx, id);
    if (before.deletedAt) throw new AppError("CONFLICT", `Trip #${String(id)} is already deleted`);
    if (before.receivedPaise > 0 && !releasePayments) {
      throw new AppError(
        "CONFLICT",
        `${formatPaise(before.receivedPaise)} is received for trip #${String(id)}; delete with releasePayments=true to keep that money as customer credit`,
        { receivedPaise: before.receivedPaise },
      );
    }
    const allocations = await tx.paymentAllocation.findMany({
      where: { tripId: id },
      include: { payment: { select: { kind: true } } },
    });
    const writeOff = allocations.find((allocation) => allocation.payment.kind === "WRITE_OFF");
    if (writeOff) {
      throw new AppError(
        "CONFLICT",
        `Trip #${String(id)} has write-off #${String(writeOff.paymentId)} against it; reverse the write-off first`,
      );
    }
    await tx.paymentAllocation.deleteMany({ where: { tripId: id } });
    const after = await tx.trip.update({
      where: { id },
      data: { deletedAt: now },
      include: tripInclude,
    });
    await writeAudit(tx, {
      entity: "Trip",
      entityId: id,
      action: "DELETE",
      before: { ...before, allocations },
      after,
    });
    return {
      trip: toTripDto(after),
      releasedPaise: before.receivedPaise,
      customerBalance: await customerBalance(tx, after.customerId),
    };
  });
}

export async function restoreTrip(db: Db, id: number, now: Date): Promise<TripSaved> {
  return db.$transaction(async (tx) => {
    const bounds = await getBusinessBounds(tx, now);
    const before = await lockTrip(tx, id);
    if (!before.deletedAt) throw new AppError("CONFLICT", `Trip #${String(id)} is not deleted`);
    // The business start may have moved after the delete.
    if (before.kind === "TRIP") assertBusinessDate(fromDbDate(before.tripDate), bounds);
    if (before.kind === "OPENING_BALANCE") {
      const live = await tx.trip.findFirst({
        where: { customerId: before.customerId, kind: "OPENING_BALANCE", deletedAt: null },
      });
      if (live) {
        throw new AppError(
          "CONFLICT",
          `${before.customer.name} already has opening balance #${String(live.id)}`,
        );
      }
    }
    const after = await tx.trip.update({
      where: { id },
      data: { deletedAt: null },
      include: tripInclude,
    });
    await writeAudit(tx, { entity: "Trip", entityId: id, action: "RESTORE", before, after });
    return {
      trip: toTripDto(after),
      customerBalance: await customerBalance(tx, after.customerId),
      warnings: [],
    };
  });
}
