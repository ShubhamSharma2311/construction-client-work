import { z } from "zod";
import { paginationSchema } from "../../lib/pagination.ts";

export const auditQuery = paginationSchema.extend({
  entity: z.string().min(1).max(50),
  entityId: z.string().min(1).max(50).optional(),
});
export type AuditQuery = z.infer<typeof auditQuery>;

export const auditEntryDto = z.object({
  id: z.string(),
  entity: z.string(),
  entityId: z.string(),
  action: z.enum(["CREATE", "UPDATE", "DELETE", "RESTORE"]),
  before: z.unknown(),
  after: z.unknown(),
  at: z.string(),
});
export type AuditEntryDto = z.infer<typeof auditEntryDto>;
