import { type RouteModule } from "../../lib/route.ts";
import { pageSchema } from "../../lib/listing.ts";
import { auditEntryDto, auditQuery } from "./audit.schema.ts";
import { listAudit } from "./audit.service.ts";

export const auditRoutes: RouteModule = (app, ctx) => {
  app.get(
    "/audit",
    { query: auditQuery, response: { 200: pageSchema(auditEntryDto) } },
    (request) => listAudit(ctx.db, request.query),
  );
};
