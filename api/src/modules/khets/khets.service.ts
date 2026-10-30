import type { Khet, Prisma } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { activeWhere, paged, type MasterListQuery, type Page } from "../../lib/listing.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { nameKey } from "../../lib/text.ts";
import type { KhetCreateInput, KhetDto, KhetUpdateInput } from "./khets.schema.ts";

function toDto(row: Khet): KhetDto {
  return { id: row.id, name: row.name, location: row.location, isActive: row.isActive };
}

export async function createKhet(db: Db, input: KhetCreateInput): Promise<KhetDto> {
  return db.$transaction(async (tx) => {
    const key = nameKey(input.name);
    await assertNameFree(tx, key);
    const created = await tx.khet.create({ data: { ...input, nameKey: key } });
    await writeAudit(tx, {
      entity: "Khet",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return toDto(created);
  });
}

export async function listKhets(db: Db, query: MasterListQuery): Promise<Page<KhetDto>> {
  const where: Prisma.KhetWhereInput = { ...activeWhere(query.active) };
  if (query.search) {
    where.OR = [
      { nameKey: { contains: nameKey(query.search) } },
      { location: { contains: query.search, mode: "insensitive" } },
    ];
  }
  return paged(
    query,
    {
      rows: (window) => db.khet.findMany({ where, orderBy: { nameKey: "asc" }, ...window }),
      count: () => db.khet.count({ where }),
    },
    toDto,
  );
}

export async function getKhet(db: Db, id: number): Promise<KhetDto> {
  const row = await db.khet.findUnique({ where: { id } });
  if (!row) throw notFound("Khet", id);
  return toDto(row);
}

export async function updateKhet(db: Db, id: number, input: KhetUpdateInput): Promise<KhetDto> {
  return db.$transaction(async (tx) => {
    const before = await tx.khet.findUnique({ where: { id } });
    if (!before) throw notFound("Khet", id);
    const key = input.name === undefined ? before.nameKey : nameKey(input.name);
    if (key !== before.nameKey) await assertNameFree(tx, key);

    const after = await tx.khet.update({ where: { id }, data: { ...input, nameKey: key } });
    await writeAudit(tx, { entity: "Khet", entityId: id, action: "UPDATE", before, after });
    return toDto(after);
  });
}

async function assertNameFree(tx: Tx, key: string): Promise<void> {
  const existing = await tx.khet.findUnique({ where: { nameKey: key } });
  if (existing) {
    // A khet taken out of use still holds its name; say so, so the owner turns it back on.
    const retired = existing.isActive ? "" : ", not in use. Turn it back on instead";
    throw new AppError("CONFLICT", `A khet named "${existing.name}" already exists${retired}`);
  }
}
