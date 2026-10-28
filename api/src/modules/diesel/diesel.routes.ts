import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { csvFileName, sendCsv } from "../../lib/http.ts";
import { dieselReportQuery, dieselReportResponse } from "./diesel.schema.ts";
import { dieselReport, dieselReportToCsv } from "./diesel.service.ts";

export const dieselRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.get(
    "/reports/diesel",
    { schema: { querystring: dieselReportQuery, response: { 200: dieselReportResponse } } },
    (request) => dieselReport(ctx.db, request.query),
  );

  app.get(
    "/reports/diesel/export",
    { schema: { querystring: dieselReportQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("diesel", request.query),
        dieselReportToCsv(await dieselReport(ctx.db, request.query)),
      ),
  );
  done();
};
