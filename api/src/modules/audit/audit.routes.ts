import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { pageSchema } from "../../lib/listing.ts";
import { auditEntryDto, auditQuery } from "./audit.schema.ts";
import { listAudit } from "./audit.service.ts";

export const auditRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.get(
    "/audit",
    { schema: { querystring: auditQuery, response: { 200: pageSchema(auditEntryDto) } } },
    (request) => listAudit(ctx.db, request.query),
  );
  done();
};
