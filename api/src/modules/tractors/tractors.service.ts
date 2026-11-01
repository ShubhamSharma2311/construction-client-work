import type { Prisma } from "#prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { activeWhere, paged, type MasterListQuery, type Page } from "../../lib/listing.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import type {
  TractorCreateInput,
  TractorDto,
  TractorUpdated,
  TractorUpdateInput,
} from "./tractors.schema.ts";

const withDriver = { defaultDriver: { select: { id: true, name: true } } } as const;
type TractorRow = Prisma.TractorGetPayload<{ include: typeof withDriver }>;

function toDto(row: TractorRow): TractorDto {
  return {
    id: row.id,
    regNumber: row.regNumber,
    label: row.label,
    isActive: row.isActive,
    defaultDriver: row.defaultDriver,
  };
}

export async function createTractor(db: Db, input: TractorCreateInput): Promise<TractorDto> {
  return db.$transaction(async (tx) => {
    await assertRegNumberFree(tx, input.regNumber);
    const created = await tx.tractor.create({ data: input, include: withDriver });
    await writeAudit(tx, {
      entity: "Tractor",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return toDto(created);
  });
}

export async function listTractors(db: Db, query: MasterListQuery): Promise<Page<TractorDto>> {
  const where: Prisma.TractorWhereInput = { ...activeWhere(query.active) };
  if (query.search) {
    where.OR = [
      { regNumber: { contains: query.search.toUpperCase().replace(/[\s-]/g, "") } },
      { label: { contains: query.search } },
    ];
  }
  return paged(
    query,
    {
      rows: (window) =>
        db.tractor.findMany({ where, include: withDriver, orderBy: { id: "asc" }, ...window }),
      count: () => db.tractor.count({ where }),
    },
    toDto,
  );
}

export async function getTractor(db: Db, id: number): Promise<TractorDto> {
  const row = await db.tractor.findUnique({ where: { id }, include: withDriver });
  if (!row) throw notFound("Tractor", id);
  return toDto(row);
}

/**
 * Deactivating a tractor frees its driver's default so a new tractor can be assigned.
 * Lock order is always tractor, then driver (see drivers.service) so the two never deadlock.
 */
export async function updateTractor(
  db: Db,
  id: number,
  input: TractorUpdateInput,
): Promise<TractorUpdated> {
  return db.$transaction(async (tx) => {
    const before = await tx.tractor.findUnique({ where: { id }, include: withDriver });
    if (!before) throw notFound("Tractor", id);
    if (input.regNumber && input.regNumber !== before.regNumber) {
      await assertRegNumberFree(tx, input.regNumber);
    }

    const warnings: string[] = [];
    if (input.isActive === false && before.defaultDriver) {
      await tx.driver.update({
        where: { id: before.defaultDriver.id },
        data: { defaultTractorId: null },
      });
      await writeAudit(tx, {
        entity: "Driver",
        entityId: before.defaultDriver.id,
        action: "UPDATE",
        before: { defaultTractorId: id },
        after: { defaultTractorId: null },
      });
      warnings.push(`${before.defaultDriver.name} no longer has a usual tractor`);
    }

    const after = await tx.tractor.update({ where: { id }, data: input, include: withDriver });
    await writeAudit(tx, { entity: "Tractor", entityId: id, action: "UPDATE", before, after });
    return { tractor: toDto(after), warnings };
  });
}

async function assertRegNumberFree(tx: Tx, regNumber: string): Promise<void> {
  const existing = await tx.tractor.findUnique({ where: { regNumber } });
  if (existing) {
    throw new AppError(
      "CONFLICT",
      `Tractor ${regNumber} already exists as #${String(existing.id)}`,
    );
  }
}
