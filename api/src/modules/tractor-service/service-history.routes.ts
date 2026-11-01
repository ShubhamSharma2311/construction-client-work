import { type RouteModule } from "../../lib/route.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { serviceHistoryResponse } from "./service-history.schema.ts";
import { serviceHistory } from "./service-history.service.ts";

export const serviceHistoryRoutes: RouteModule = (app, ctx) => {
  app.get(
    "/tractors/:id/services",
    { params: idParams, response: { 200: serviceHistoryResponse } },
    (request) => serviceHistory(ctx.db, request.params.id),
  );
};
