import { Prisma, type AuditAction } from "#prisma/client.ts";
import type { Tx } from "./prisma.ts";

export interface AuditEntry {
  entity: string;
  entityId: string | number | bigint;
  action: AuditAction;
  before?: object | null;
  after?: object | null;
}

/** Must be called with the same transaction as the change it records. */
export async function writeAudit(tx: Tx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.create({
    data: {
      entity: entry.entity,
      entityId: String(entry.entityId),
      action: entry.action,
      before: toJsonColumn(entry.before),
      after: toJsonColumn(entry.after),
    },
  });
}

function toJsonColumn(
  value: object | null | undefined,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === null || value === undefined) return Prisma.DbNull;
  // Round-trip through JSON so Dates become ISO strings and BigInt ids become strings.
  const json = JSON.stringify(value, (_key, item: unknown) =>
    typeof item === "bigint" ? item.toString() : item,
  );
  return JSON.parse(json) as Prisma.InputJsonValue;
}
