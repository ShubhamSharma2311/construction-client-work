import type { Expense, Prisma } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { MAX_EXPORT_ROWS, toCsv, type CsvColumn } from "../../lib/csv.ts";
import { assertBusinessDate, fromDbDate, toDbDate, type IsoDate } from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { runIdempotent, type IdempotentResult } from "../../lib/idempotency.ts";
import { paiseToRupeeString } from "../../lib/money.ts";
import { toSkipTake } from "../../lib/pagination.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { lockRow } from "../../lib/locks.ts";
import { assertUsable } from "../../lib/usable.ts";
import { getBusinessBounds } from "../settings/settings.service.ts";
import {
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
  type ExpenseCreateInput,
  type ExpenseDto,
  type ExpenseFilter,
  type ExpenseListQuery,
  type ExpensePage,
  type ExpenseSaved,
  type ExpenseUpdateInput,
  periodProblem,
} from "./expenses.schema.ts";

export const expenseInclude = {
  driver: { select: { id: true, name: true } },
  tractor: { select: { id: true, regNumber: true } },
  labourer: { select: { id: true, name: true } },
} as const satisfies Prisma.ExpenseInclude;
type ExpenseRow = Prisma.ExpenseGetPayload<{ include: typeof expenseInclude }>;

const optionalDate = (date: Date | null) => (date ? fromDbDate(date) : null);

export function toExpenseDto(row: ExpenseRow): ExpenseDto {
  return {
    id: row.id,
    category: row.category,
    spentOn: fromDbDate(row.spentOn),
    amountPaise: row.amountPaise,
    mode: row.mode,
    driver: row.driver,
    tractor: row.tractor,
    labourer: row.labourer,
    dieselLitres: row.dieselMl === null ? null : row.dieselMl / 1000,
    hourMeter: row.hourMeter,
    periodFrom: optionalDate(row.periodFrom),
    periodTo: optionalDate(row.periodTo),
    reference: row.reference,
    notes: row.notes,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

const COMMON_FIELDS = ["spentOn", "amount", "mode", "reference", "notes"] as const;

/** Fields the owner may change on each kind of expense through this module. */
const EDITABLE: Partial<Record<ExpenseCategory, ReadonlySet<keyof ExpenseUpdateInput>>> = {
  LABOUR: new Set([...COMMON_FIELDS, "labourerId"]),
  ROYALTY: new Set([...COMMON_FIELDS, "periodFrom", "periodTo"]),
  POLICE: new Set(COMMON_FIELDS),
  OTHER: new Set(COMMON_FIELDS),
  EMERGENCY: new Set([...COMMON_FIELDS, "tractorId", "driverId"]),
};

const NOTES_REQUIRED: ReadonlySet<ExpenseCategory> = new Set([
  "POLICE",
  "OTHER",
  "EMERGENCY",
  "TRACTOR_SERVICE",
]);

interface Links {
  labourerId?: number | null;
  tractorId?: number | null;
  driverId?: number | null;
}

/** The labourer, tractor and driver an expense names must exist and be active. */
async function checkLinks(tx: Tx, links: Links, previous?: Expense): Promise<void> {
  if (links.labourerId) {
    const row = await tx.labourer.findUnique({ where: { id: links.labourerId } });
    assertUsable("Labourer", row, links.labourerId, previous?.labourerId, (r) => r.name);
  }
  if (links.tractorId) {
    const row = await tx.tractor.findUnique({ where: { id: links.tractorId } });
    assertUsable("Tractor", row, links.tractorId, previous?.tractorId, (r) => r.regNumber);
  }
  if (links.driverId) {
    const row = await tx.driver.findUnique({ where: { id: links.driverId } });
    assertUsable("Driver", row, links.driverId, previous?.driverId, (r) => r.name);
  }
}

function linksOf(input: ExpenseCreateInput): Links {
  switch (input.category) {
    case "LABOUR":
      return { labourerId: input.labourerId };
    case "EMERGENCY":
      return { tractorId: input.tractorId, driverId: input.driverId };
    case "ROYALTY":
    case "POLICE":
    case "OTHER":
      return {};
  }
}

/** Two royalty payments for overlapping periods are allowed but usually a double entry. */
async function royaltyOverlapWarnings(
  tx: Tx,
  period: { from: IsoDate | null; to: IsoDate | null },
  excludeId?: number,
): Promise<string[]> {
  if (!period.from || !period.to) return [];
  const overlapping = await tx.expense.findMany({
    where: {
      category: "ROYALTY",
      deletedAt: null,
      id: excludeId === undefined ? undefined : { not: excludeId },
      periodFrom: { lte: toDbDate(period.to) },
      periodTo: { gte: toDbDate(period.from) },
    },
  });
  return overlapping.map((other) => {
    // The query only matches rows with both dates, and a CHECK keeps them paired.
    if (!other.periodFrom || !other.periodTo) {
      throw new Error(`Royalty #${String(other.id)} matched an overlap without a full period`);
    }
    return `Royalty #${String(other.id)} already covers ${fromDbDate(other.periodFrom)} to ${fromDbDate(other.periodTo)}`;
  });
}

function createData(input: ExpenseCreateInput): Prisma.ExpenseUncheckedCreateInput {
  const base = {
    category: input.category,
    spentOn: toDbDate(input.spentOn),
    amountPaise: input.amount,
    mode: input.mode,
    reference: input.reference ?? null,
    notes: input.notes ?? null,
  };
  switch (input.category) {
    case "LABOUR":
      return { ...base, labourerId: input.labourerId };
    case "ROYALTY":
      return {
        ...base,
        periodFrom: input.periodFrom ? toDbDate(input.periodFrom) : null,
        periodTo: input.periodTo ? toDbDate(input.periodTo) : null,
      };
    case "EMERGENCY":
      return { ...base, tractorId: input.tractorId ?? null, driverId: input.driverId ?? null };
    case "POLICE":
    case "OTHER":
      return base;
  }
}

export async function createExpense(
  db: Db,
  input: ExpenseCreateInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<ExpenseSaved>> {
  return runIdempotent(
    db,
    { key: idempotencyKey, route: "POST /expenses", body: input },
    async (tx) => {
      assertBusinessDate(input.spentOn, await getBusinessBounds(tx, now));
      await checkLinks(tx, linksOf(input));
      const warnings =
        input.category === "ROYALTY"
          ? await royaltyOverlapWarnings(tx, {
              from: input.periodFrom ?? null,
              to: input.periodTo ?? null,
            })
          : [];
      const created = await tx.expense.create({ data: createData(input), include: expenseInclude });
      await writeAudit(tx, {
        entity: "Expense",
        entityId: created.id,
        action: "CREATE",
        after: created,
      });
      return { statusCode: 201, body: { expense: toExpenseDto(created), warnings } };
    },
  );
}

function assertEditable(expense: Expense, input: ExpenseUpdateInput): void {
  const editable = EDITABLE[expense.category];
  if (!editable) {
    throw new AppError(
      "CONFLICT",
      `A ${expense.category} expense is changed from its own screen, not here`,
    );
  }
  const refused = Object.keys(input).filter(
    (field) => !editable.has(field as keyof ExpenseUpdateInput),
  );
  if (refused.length > 0) {
    throw new AppError(
      "VALIDATION",
      `A ${expense.category} expense does not take ${refused.join(", ")}`,
    );
  }
  if (input.notes === null && NOTES_REQUIRED.has(expense.category)) {
    throw new AppError("VALIDATION", `A ${expense.category} expense must say what it was for`);
  }
}

export async function updateExpense(
  db: Db,
  id: number,
  input: ExpenseUpdateInput,
  now: Date,
): Promise<ExpenseSaved> {
  return db.$transaction(async (tx) => {
    const before = await lockExpense(tx, id);
    if (before.deletedAt)
      throw new AppError("CONFLICT", `Expense #${String(id)} is deleted; restore it first`);
    assertEditable(before, input);
    if (input.spentOn) assertBusinessDate(input.spentOn, await getBusinessBounds(tx, now));
    await checkLinks(tx, input, before);

    const period = {
      from: input.periodFrom === undefined ? optionalDate(before.periodFrom) : input.periodFrom,
      to: input.periodTo === undefined ? optionalDate(before.periodTo) : input.periodTo,
    };
    const problem = periodProblem(period.from, period.to);
    if (problem) throw new AppError("VALIDATION", problem);
    const warnings =
      before.category === "ROYALTY" ? await royaltyOverlapWarnings(tx, period, id) : [];

    // Prisma leaves fields that are undefined untouched; null clears an optional field.
    const after = await tx.expense.update({
      where: { id },
      data: {
        spentOn: input.spentOn && toDbDate(input.spentOn),
        amountPaise: input.amount,
        mode: input.mode,
        reference: input.reference,
        notes: input.notes,
        labourerId: input.labourerId,
        tractorId: input.tractorId,
        driverId: input.driverId,
        periodFrom:
          input.periodFrom === undefined
            ? undefined
            : input.periodFrom && toDbDate(input.periodFrom),
        periodTo:
          input.periodTo === undefined ? undefined : input.periodTo && toDbDate(input.periodTo),
      },
      include: expenseInclude,
    });
    await writeAudit(tx, { entity: "Expense", entityId: id, action: "UPDATE", before, after });
    return { expense: toExpenseDto(after), warnings };
  });
}

export async function deleteExpense(db: Db, id: number, now: Date): Promise<ExpenseDto> {
  return db.$transaction(async (tx) => {
    const before = await lockExpense(tx, id);
    if (before.deletedAt)
      throw new AppError("CONFLICT", `Expense #${String(id)} is already deleted`);
    if (!EDITABLE[before.category]) {
      throw new AppError("CONFLICT", `A ${before.category} expense is removed from its own screen`);
    }
    const after = await tx.expense.update({
      where: { id },
      data: { deletedAt: now },
      include: expenseInclude,
    });
    await writeAudit(tx, { entity: "Expense", entityId: id, action: "DELETE", before, after });
    return toExpenseDto(after);
  });
}

export async function restoreExpense(db: Db, id: number, now: Date): Promise<ExpenseDto> {
  return db.$transaction(async (tx) => {
    const bounds = await getBusinessBounds(tx, now);
    const before = await lockExpense(tx, id);
    if (!before.deletedAt) throw new AppError("CONFLICT", `Expense #${String(id)} is not deleted`);
    if (!EDITABLE[before.category]) {
      throw new AppError(
        "CONFLICT",
        `A ${before.category} expense is restored from its own screen`,
      );
    }
    // The business start may have moved after the delete.
    assertBusinessDate(fromDbDate(before.spentOn), bounds);
    const after = await tx.expense.update({
      where: { id },
      data: { deletedAt: null },
      include: expenseInclude,
    });
    await writeAudit(tx, { entity: "Expense", entityId: id, action: "RESTORE", before, after });
    return toExpenseDto(after);
  });
}

/** Locks the row so an edit, delete or restore never acts on a state another one just changed. */
async function lockExpense(tx: Tx, id: number): Promise<ExpenseRow> {
  await lockRow(tx, "Expense", id);
  const row = await tx.expense.findUnique({ where: { id }, include: expenseInclude });
  if (!row) throw notFound("Expense", id);
  return row;
}

export async function getExpense(db: Db, id: number): Promise<ExpenseDto> {
  const row = await db.expense.findUnique({ where: { id }, include: expenseInclude });
  if (!row) throw notFound("Expense", id);
  return toExpenseDto(row);
}

export function expenseWhere(filter: ExpenseFilter): Prisma.ExpenseWhereInput {
  const where: Prisma.ExpenseWhereInput = {
    deletedAt: filter.deleted === "true" ? { not: null } : null,
    category: filter.category,
    tractorId: filter.tractorId,
    driverId: filter.driverId,
    labourerId: filter.labourerId,
    mode: filter.mode,
  };
  if (filter.from || filter.to) {
    where.spentOn = {
      ...(filter.from ? { gte: toDbDate(filter.from) } : {}),
      ...(filter.to ? { lte: toDbDate(filter.to) } : {}),
    };
  }
  return where;
}

export async function listExpenses(db: Db, query: ExpenseListQuery): Promise<ExpensePage> {
  const where = expenseWhere(query);
  // One snapshot, so the page, its count and its totals always agree.
  const [rows, total, groups] = await db.$transaction(
    [
      db.expense.findMany({
        where,
        include: expenseInclude,
        orderBy: [{ spentOn: "desc" }, { id: "desc" }],
        ...toSkipTake(query),
      }),
      db.expense.count({ where }),
      db.expense.groupBy({
        by: ["category"],
        where,
        _sum: { amountPaise: true },
        orderBy: { category: "asc" },
      }),
    ],
    { isolationLevel: "RepeatableRead" },
  );
  const byCategory = Object.fromEntries(
    EXPENSE_CATEGORIES.map((category) => [
      category,
      groups.find((group) => group.category === category)?._sum.amountPaise ?? 0,
    ]),
  ) as Record<ExpenseCategory, number>;
  const amountPaise = Object.values(byCategory).reduce((sum, value) => sum + value, 0);
  return {
    items: rows.map(toExpenseDto),
    total,
    page: query.page,
    limit: query.limit,
    totals: { amountPaise, byCategory },
  };
}

const exportColumns: CsvColumn<ExpenseDto>[] = [
  { header: "Expense #", value: (row) => row.id },
  { header: "Date", value: (row) => row.spentOn },
  { header: "Category", value: (row) => row.category },
  { header: "Amount (Rs)", value: (row) => paiseToRupeeString(row.amountPaise) },
  { header: "Mode", value: (row) => row.mode },
  { header: "Labourer", value: (row) => row.labourer?.name ?? null },
  { header: "Tractor", value: (row) => row.tractor?.regNumber ?? null },
  { header: "Driver", value: (row) => row.driver?.name ?? null },
  { header: "Diesel (L)", value: (row) => row.dieselLitres },
  {
    header: "Period",
    value: (row) => (row.periodFrom ? `${row.periodFrom} to ${row.periodTo ?? ""}` : null),
  },
  { header: "Reference", value: (row) => row.reference },
  { header: "Notes", value: (row) => row.notes },
];

export async function exportExpenses(db: Db, filter: ExpenseFilter): Promise<string> {
  const where = expenseWhere(filter);
  const count = await db.expense.count({ where });
  if (count > MAX_EXPORT_ROWS) {
    throw new AppError(
      "VALIDATION",
      `${String(count)} expenses match; narrow the dates to export at most ${String(MAX_EXPORT_ROWS)}`,
    );
  }
  const rows = await db.expense.findMany({
    where,
    include: expenseInclude,
    orderBy: [{ spentOn: "asc" }, { id: "asc" }],
  });
  return toCsv(exportColumns, rows.map(toExpenseDto));
}
