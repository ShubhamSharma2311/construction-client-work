import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { serviceHistoryResponse } from "./service-history.schema.ts";
import { serviceHistory } from "./service-history.service.ts";

export const serviceHistoryRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.get(
    "/tractors/:id/services",
    { schema: { params: idParams, response: { 200: serviceHistoryResponse } } },
    (request) => serviceHistory(ctx.db, request.params.id),
  );
  done();
};
