import { type RouteModule } from "../../lib/route.ts";
import { csvFileName, sendCsv } from "../../lib/http.ts";
import { dieselReportQuery, dieselReportResponse } from "./diesel.schema.ts";
import { dieselReport, dieselReportToCsv } from "./diesel.service.ts";

export const dieselRoutes: RouteModule = (app, ctx) => {
  app.get(
    "/reports/diesel",
    { query: dieselReportQuery, response: { 200: dieselReportResponse } },
    (request) => dieselReport(ctx.db, request.query),
  );

  app.get("/reports/diesel/export", { query: dieselReportQuery }, async (request) =>
    sendCsv(
      csvFileName("diesel", request.query),
      dieselReportToCsv(await dieselReport(ctx.db, request.query)),
    ),
  );
};
