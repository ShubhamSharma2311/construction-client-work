import type { Labourer, Prisma } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { notFound } from "../../lib/errors.ts";
import { activeWhere, paged, type MasterListQuery, type Page } from "../../lib/listing.ts";
import { phoneSearchTerm } from "../../lib/phone.ts";
import type { Db } from "../../lib/prisma.ts";
import type { LabourerCreateInput, LabourerDto, LabourerUpdateInput } from "./labourers.schema.ts";

function toDto(row: Labourer): LabourerDto {
  return { id: row.id, name: row.name, phone: row.phone, notes: row.notes, isActive: row.isActive };
}

/** Labourers may share a phone (a contractor's number), so phone is not unique. */
export async function createLabourer(db: Db, input: LabourerCreateInput): Promise<LabourerDto> {
  return db.$transaction(async (tx) => {
    const created = await tx.labourer.create({ data: input });
    await writeAudit(tx, {
      entity: "Labourer",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return toDto(created);
  });
}

export async function listLabourers(db: Db, query: MasterListQuery): Promise<Page<LabourerDto>> {
  const where: Prisma.LabourerWhereInput = { ...activeWhere(query.active) };
  if (query.search) {
    const phone = phoneSearchTerm(query.search);
    where.OR = [
      { name: { contains: query.search } },
      ...(phone ? [{ phone: { contains: phone } }] : []),
    ];
  }
  return paged(
    query,
    {
      rows: (window) => db.labourer.findMany({ where, orderBy: { name: "asc" }, ...window }),
      count: () => db.labourer.count({ where }),
    },
    toDto,
  );
}

export async function getLabourer(db: Db, id: number): Promise<LabourerDto> {
  const row = await db.labourer.findUnique({ where: { id } });
  if (!row) throw notFound("Labourer", id);
  return toDto(row);
}

export async function updateLabourer(
  db: Db,
  id: number,
  input: LabourerUpdateInput,
): Promise<LabourerDto> {
  return db.$transaction(async (tx) => {
    const before = await tx.labourer.findUnique({ where: { id } });
    if (!before) throw notFound("Labourer", id);
    const after = await tx.labourer.update({ where: { id }, data: input });
    await writeAudit(tx, { entity: "Labourer", entityId: id, action: "UPDATE", before, after });
    return toDto(after);
  });
}
