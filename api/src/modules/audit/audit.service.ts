import type { Page } from "../../lib/listing.ts";
import { toSkipTake } from "../../lib/pagination.ts";
import type { Db } from "../../lib/prisma.ts";
import type { AuditEntryDto, AuditQuery } from "./audit.schema.ts";

/** The change history of one record (or one kind of record), newest first. */
export async function listAudit(db: Db, query: AuditQuery): Promise<Page<AuditEntryDto>> {
  const where = {
    entity: query.entity,
    ...(query.entityId === undefined ? {} : { entityId: query.entityId }),
  };
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({ where, orderBy: { id: "desc" }, ...toSkipTake(query) }),
    db.auditLog.count({ where }),
  ]);
  return {
    items: rows.map((row) => ({
      id: row.id.toString(),
      entity: row.entity,
      entityId: row.entityId,
      action: row.action,
      before: row.before,
      after: row.after,
      at: row.at.toISOString(),
    })),
    total,
    page: query.page,
    limit: query.limit,
  };
}
