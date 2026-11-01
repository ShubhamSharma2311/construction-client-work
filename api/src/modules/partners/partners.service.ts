import type { Partner, Prisma } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { notFound } from "../../lib/errors.ts";
import { activeWhere, paged, type MasterListQuery, type Page } from "../../lib/listing.ts";
import type { Db } from "../../lib/prisma.ts";
import type { PartnerCreateInput, PartnerDto, PartnerUpdateInput } from "./partners.schema.ts";

function toDto(row: Partner): PartnerDto {
  return {
    id: row.id,
    name: row.name,
    sharePercent: row.shareBasisPoints === null ? null : row.shareBasisPoints / 100,
    notes: row.notes,
    isActive: row.isActive,
  };
}

/** Percent from the API becomes basis points in the database; absent stays absent. */
function toColumns({ sharePercent, ...rest }: PartnerUpdateInput) {
  if (sharePercent === undefined) return rest;
  return {
    ...rest,
    shareBasisPoints: sharePercent === null ? null : Math.round(sharePercent * 100),
  };
}

export async function createPartner(db: Db, input: PartnerCreateInput): Promise<PartnerDto> {
  return db.$transaction(async (tx) => {
    const created = await tx.partner.create({ data: { name: input.name, ...toColumns(input) } });
    await writeAudit(tx, {
      entity: "Partner",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return toDto(created);
  });
}

export async function listPartners(db: Db, query: MasterListQuery): Promise<Page<PartnerDto>> {
  const where: Prisma.PartnerWhereInput = { ...activeWhere(query.active) };
  if (query.search) where.name = { contains: query.search };
  return paged(
    query,
    {
      rows: (window) => db.partner.findMany({ where, orderBy: { name: "asc" }, ...window }),
      count: () => db.partner.count({ where }),
    },
    toDto,
  );
}

export async function getPartner(db: Db, id: number): Promise<PartnerDto> {
  const row = await db.partner.findUnique({ where: { id } });
  if (!row) throw notFound("Partner", id);
  return toDto(row);
}

export async function updatePartner(
  db: Db,
  id: number,
  input: PartnerUpdateInput,
): Promise<PartnerDto> {
  return db.$transaction(async (tx) => {
    const before = await tx.partner.findUnique({ where: { id } });
    if (!before) throw notFound("Partner", id);
    const after = await tx.partner.update({ where: { id }, data: toColumns(input) });
    await writeAudit(tx, { entity: "Partner", entityId: id, action: "UPDATE", before, after });
    return toDto(after);
  });
}
