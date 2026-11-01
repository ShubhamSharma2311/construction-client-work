import type { Partner, Prisma } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { assertExportable, toCsv, type CsvColumn } from "../../lib/csv.ts";
import {
  assertBusinessDate,
  dayFilter,
  fromDbDate,
  toDbDate,
  type IsoDate,
} from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { runIdempotent, type IdempotentResult } from "../../lib/idempotency.ts";
import { paiseToRupeeString } from "../../lib/money.ts";
import { toSkipTake } from "../../lib/pagination.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { getBusinessBounds } from "../settings/settings.service.ts";
import type {
  PartnerLedger,
  PartnerTxnDto,
  PartnerTxnFilter,
  PartnerTxnInput,
  PartnerTxnListQuery,
  PartnerTxnPage,
  PartnerTxnSaved,
  PartnerTxnUpdateInput,
} from "./partner-account.schema.ts";

const txnInclude = {
  partner: { select: { id: true, name: true } },
} as const satisfies Prisma.PartnerTxnInclude;
type TxnRow = Prisma.PartnerTxnGetPayload<{ include: typeof txnInclude }>;

function toDto(row: TxnRow): PartnerTxnDto {
  return {
    id: row.id,
    partner: row.partner,
    txnDate: fromDbDate(row.txnDate),
    direction: row.direction,
    amountPaise: row.amountPaise,
    mode: row.mode,
    notes: row.notes,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Paid out to the partner counts up; money the partner put back counts down. */
function signed(direction: TxnRow["direction"], amountPaise: number): number {
  return direction === "PAID_TO_PARTNER" ? amountPaise : -amountPaise;
}

interface DirectionTotals {
  paidToPartnerPaise: number;
  receivedFromPartnerPaise: number;
  netPaidPaise: number;
}

function directionTotalsOf(paid: number, received: number): DirectionTotals {
  return {
    paidToPartnerPaise: paid,
    receivedFromPartnerPaise: received,
    netPaidPaise: paid - received,
  };
}

function totalsFromSums(
  groups: readonly { direction: TxnRow["direction"]; _sum: { amountPaise: number | null } }[],
): DirectionTotals {
  const sumFor = (direction: TxnRow["direction"]) =>
    groups.find((group) => group.direction === direction)?._sum.amountPaise ?? 0;
  return directionTotalsOf(sumFor("PAID_TO_PARTNER"), sumFor("RECEIVED_FROM_PARTNER"));
}

function sumOf(
  rows: readonly { direction: TxnRow["direction"]; amountPaise: number }[],
  direction: TxnRow["direction"],
): number {
  return rows
    .filter((row) => row.direction === direction)
    .reduce((sum, row) => sum + row.amountPaise, 0);
}

async function directionTotals(
  db: Db | Tx,
  where: Prisma.PartnerTxnWhereInput,
): Promise<DirectionTotals> {
  const groups = await db.partnerTxn.groupBy({
    by: ["direction"],
    where,
    _sum: { amountPaise: true },
    orderBy: { direction: "asc" },
  });
  return totalsFromSums(groups);
}

async function netPaid(db: Db | Tx, partnerId: number): Promise<number> {
  return (await directionTotals(db, { partnerId, deletedAt: null })).netPaidPaise;
}

/** A partner who has left can still be settled with, so inactive partners are allowed. */
async function readPartner(tx: Db | Tx, partnerId: number): Promise<Partner> {
  const partner = await tx.partner.findUnique({ where: { id: partnerId } });
  if (!partner) throw notFound("Partner", partnerId);
  return partner;
}

export async function recordPartnerTxn(
  db: Db,
  partnerId: number,
  input: PartnerTxnInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<PartnerTxnSaved>> {
  const request = {
    key: idempotencyKey,
    route: `POST /partners/${String(partnerId)}/txns`,
    body: input,
  };
  return runIdempotent(db, request, async (tx) => {
    assertBusinessDate(input.txnDate, await getBusinessBounds(tx, now));
    await readPartner(tx, partnerId);
    const created = await tx.partnerTxn.create({
      data: {
        partnerId,
        txnDate: toDbDate(input.txnDate),
        direction: input.direction,
        amountPaise: input.amount,
        mode: input.mode,
        notes: input.notes ?? null,
      },
      include: txnInclude,
    });
    await writeAudit(tx, {
      entity: "PartnerTxn",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return {
      statusCode: 201,
      body: { txn: toDto(created), netPaidPaise: await netPaid(tx, partnerId) },
    };
  });
}

async function lockTxn(tx: Tx, id: number): Promise<TxnRow> {
  const row = await tx.partnerTxn.findUnique({ where: { id }, include: txnInclude });
  if (!row) throw notFound("Partner transaction", id);
  return row;
}

export async function updatePartnerTxn(
  db: Db,
  id: number,
  input: PartnerTxnUpdateInput,
  now: Date,
): Promise<PartnerTxnSaved> {
  return db.$transaction(async (tx) => {
    const before = await lockTxn(tx, id);
    if (before.deletedAt)
      throw new AppError("CONFLICT", `Partner transaction #${String(id)} is deleted`);
    if (input.txnDate) assertBusinessDate(input.txnDate, await getBusinessBounds(tx, now));
    const after = await tx.partnerTxn.update({
      where: { id },
      data: {
        direction: input.direction,
        txnDate: input.txnDate && toDbDate(input.txnDate),
        amountPaise: input.amount,
        mode: input.mode,
        notes: input.notes,
      },
      include: txnInclude,
    });
    await writeAudit(tx, { entity: "PartnerTxn", entityId: id, action: "UPDATE", before, after });
    return { txn: toDto(after), netPaidPaise: await netPaid(tx, after.partnerId) };
  });
}

export async function deletePartnerTxn(db: Db, id: number, now: Date): Promise<PartnerTxnSaved> {
  return db.$transaction(async (tx) => {
    const before = await lockTxn(tx, id);
    if (before.deletedAt)
      throw new AppError("CONFLICT", `Partner transaction #${String(id)} is already deleted`);
    const after = await tx.partnerTxn.update({
      where: { id },
      data: { deletedAt: now },
      include: txnInclude,
    });
    await writeAudit(tx, { entity: "PartnerTxn", entityId: id, action: "DELETE", before, after });
    return { txn: toDto(after), netPaidPaise: await netPaid(tx, after.partnerId) };
  });
}

/** The partner's account: what went to them, what came back, and the net paid over time. */
export async function partnerLedgerIn(
  tx: Tx,
  partnerId: number,
  range: { from?: IsoDate; to?: IsoDate },
): Promise<PartnerLedger> {
  const partner = await readPartner(tx, partnerId);
  const live = { partnerId, deletedAt: null };
  const opening = range.from
    ? (await directionTotals(tx, { ...live, txnDate: { lt: toDbDate(range.from) } })).netPaidPaise
    : 0;
  const rows = await tx.partnerTxn.findMany({
    where: { ...live, txnDate: dayFilter(range) },
    orderBy: [{ txnDate: "asc" }, { id: "asc" }],
  });
  let running = opening;
  const entries = rows.map((row) => {
    running += signed(row.direction, row.amountPaise);
    return {
      date: fromDbDate(row.txnDate),
      direction: row.direction,
      refId: row.id,
      amountPaise: row.amountPaise,
      mode: row.mode,
      notes: row.notes,
      netPaidPaise: running,
    };
  });
  return {
    partner: { id: partner.id, name: partner.name },
    from: range.from ?? null,
    to: range.to ?? null,
    openingNetPaidPaise: opening,
    entries,
    totals: directionTotalsOf(sumOf(rows, "PAID_TO_PARTNER"), sumOf(rows, "RECEIVED_FROM_PARTNER")),
    closingNetPaidPaise: running,
  };
}

export async function partnerLedger(
  db: Db,
  partnerId: number,
  range: { from?: IsoDate; to?: IsoDate },
): Promise<PartnerLedger> {
  return db.$transaction((tx) => partnerLedgerIn(tx, partnerId, range), {});
}

function txnWhere(filter: PartnerTxnFilter): Prisma.PartnerTxnWhereInput {
  return {
    deletedAt: filter.deleted === "true" ? { not: null } : null,
    partnerId: filter.partnerId,
    direction: filter.direction,
    mode: filter.mode,
    txnDate: dayFilter(filter),
  };
}

export async function listPartnerTxns(db: Db, query: PartnerTxnListQuery): Promise<PartnerTxnPage> {
  const where = txnWhere(query);
  // One snapshot, so the page, its count and its totals always agree.
  const [rows, total, groups] = await db.$transaction([
    db.partnerTxn.findMany({
      where,
      include: txnInclude,
      orderBy: [{ txnDate: "desc" }, { id: "desc" }],
      ...toSkipTake(query),
    }),
    db.partnerTxn.count({ where }),
    db.partnerTxn.groupBy({
      by: ["direction"],
      where,
      _sum: { amountPaise: true },
      orderBy: { direction: "asc" },
    }),
  ]);
  return {
    items: rows.map(toDto),
    total,
    page: query.page,
    limit: query.limit,
    totals: totalsFromSums(groups),
  };
}

const exportColumns: CsvColumn<PartnerTxnDto>[] = [
  { header: "Txn #", value: (row) => row.id },
  { header: "Date", value: (row) => row.txnDate },
  { header: "Partner", value: (row) => row.partner.name },
  { header: "Direction", value: (row) => row.direction },
  { header: "Amount (Rs)", value: (row) => paiseToRupeeString(row.amountPaise) },
  { header: "Mode", value: (row) => row.mode },
  { header: "Notes", value: (row) => row.notes },
];

export async function exportPartnerTxns(db: Db, filter: PartnerTxnFilter): Promise<string> {
  const where = txnWhere(filter);
  const count = await db.partnerTxn.count({ where });
  assertExportable(count, "transactions");
  const rows = await db.partnerTxn.findMany({
    where,
    include: txnInclude,
    orderBy: [{ txnDate: "asc" }, { id: "asc" }],
  });
  return toCsv(exportColumns, rows.map(toDto));
}
