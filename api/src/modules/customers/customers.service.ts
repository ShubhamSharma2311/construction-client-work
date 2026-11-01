import type { Customer, Prisma } from "../../generated/prisma/client.ts";
import { writeAudit } from "../../lib/audit.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { activeWhere, paged, type MasterListQuery, type Page } from "../../lib/listing.ts";
import { phoneSearchTerm } from "../../lib/phone.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { nameKey } from "../../lib/text.ts";
import type {
  CustomerCreated,
  CustomerCreateInput,
  CustomerDto,
  CustomerUpdateInput,
} from "./customers.schema.ts";

function toDto(row: Customer): CustomerDto {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    village: row.village,
    notes: row.notes,
    isActive: row.isActive,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function createCustomer(db: Db, input: CustomerCreateInput): Promise<CustomerCreated> {
  return db.$transaction(async (tx) => {
    if (input.phone) await assertPhoneFree(tx, input.phone);
    const created = await tx.customer.create({
      data: { ...input, nameKey: nameKey(input.name) },
    });
    await writeAudit(tx, {
      entity: "Customer",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    const sameName = await tx.customer.findMany({
      where: { nameKey: created.nameKey, id: { not: created.id } },
      orderBy: { id: "asc" },
    });
    return { customer: toDto(created), possibleDuplicates: sameName.map(toDto) };
  });
}

export async function listCustomers(db: Db, query: MasterListQuery): Promise<Page<CustomerDto>> {
  const where: Prisma.CustomerWhereInput = { ...activeWhere(query.active) };
  if (query.search) {
    const phone = phoneSearchTerm(query.search);
    where.OR = [
      { nameKey: { contains: nameKey(query.search) } },
      { village: { contains: query.search } },
      ...(phone ? [{ phone: { contains: phone } }] : []),
    ];
  }
  return paged(
    query,
    {
      rows: (window) =>
        db.customer.findMany({ where, orderBy: [{ nameKey: "asc" }, { id: "asc" }], ...window }),
      count: () => db.customer.count({ where }),
    },
    toDto,
  );
}

export async function getCustomer(db: Db, id: number): Promise<CustomerDto> {
  const row = await db.customer.findUnique({ where: { id } });
  if (!row) throw notFound("Customer", id);
  return toDto(row);
}

export async function updateCustomer(
  db: Db,
  id: number,
  input: CustomerUpdateInput,
): Promise<CustomerDto> {
  return db.$transaction(async (tx) => {
    const before = await tx.customer.findUnique({ where: { id } });
    if (!before) throw notFound("Customer", id);
    if (input.phone && input.phone !== before.phone) await assertPhoneFree(tx, input.phone);

    // Prisma leaves fields that are undefined untouched; null clears an optional field.
    const after = await tx.customer.update({
      where: { id },
      data: { ...input, ...(input.name === undefined ? {} : { nameKey: nameKey(input.name) }) },
    });
    await writeAudit(tx, { entity: "Customer", entityId: id, action: "UPDATE", before, after });
    return toDto(after);
  });
}

async function assertPhoneFree(tx: Tx, phone: string): Promise<void> {
  const owner = await tx.customer.findFirst({ where: { phone } });
  if (owner) {
    throw new AppError(
      "CONFLICT",
      `Phone ${phone} already belongs to customer #${String(owner.id)} ${owner.name}`,
      { customerId: owner.id },
    );
  }
}
