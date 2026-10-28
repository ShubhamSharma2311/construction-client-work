import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { csvFileName, sendCsv } from "../../lib/http.ts";
import { driverReport, khetReport, tractorReport } from "./breakdowns.service.ts";
import { cashbook } from "./cashbook.service.ts";
import { dashboard } from "./dashboard.service.ts";
import { profitAndLoss } from "./pnl.service.ts";
import {
  cashbookToCsv,
  driverReportToCsv,
  khetReportToCsv,
  pnlToCsv,
  summaryToCsv,
  tractorReportToCsv,
} from "./report-exports.ts";
import { assertReportRange, MAX_DAYWISE_DAYS } from "./report-range.ts";
import {
  cashbookQuery,
  cashbookResponse,
  dashboardQuery,
  dashboardResponse,
  driverReportResponse,
  khetReportResponse,
  pnlResponse,
  reportRangeQuery,
  summaryResponse,
  tractorReportResponse,
  type ReportRange,
} from "./reports.schema.ts";
import { dailySummary } from "./summary.service.ts";

export const reportRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  const checked = async (range: ReportRange, maxDays?: number): Promise<ReportRange> => {
    await assertReportRange(ctx.db, range, ctx.clock(), maxDays ? { maxDays } : {});
    return range;
  };

  app.get(
    "/reports/pnl",
    { schema: { querystring: reportRangeQuery, response: { 200: pnlResponse } } },
    async (request) => profitAndLoss(ctx.db, await checked(request.query)),
  );
  app.get(
    "/reports/pnl/export",
    { schema: { querystring: reportRangeQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("profit_and_loss", request.query),
        pnlToCsv(await profitAndLoss(ctx.db, await checked(request.query))),
      ),
  );

  app.get(
    "/reports/cashbook",
    { schema: { querystring: cashbookQuery, response: { 200: cashbookResponse } } },
    async (request) => {
      await assertReportRange(ctx.db, request.query, ctx.clock());
      return cashbook(ctx.db, request.query);
    },
  );
  app.get(
    "/reports/cashbook/export",
    { schema: { querystring: cashbookQuery } },
    async (request, reply) => {
      await assertReportRange(ctx.db, request.query, ctx.clock());
      const name = csvFileName(`cashbook_${request.query.mode.toLowerCase()}`, request.query);
      return sendCsv(reply, name, cashbookToCsv(await cashbook(ctx.db, request.query)));
    },
  );

  app.get(
    "/reports/summary",
    { schema: { querystring: reportRangeQuery, response: { 200: summaryResponse } } },
    async (request) => dailySummary(ctx.db, await checked(request.query, MAX_DAYWISE_DAYS)),
  );
  app.get(
    "/reports/summary/export",
    { schema: { querystring: reportRangeQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("daily_summary", request.query),
        summaryToCsv(await dailySummary(ctx.db, await checked(request.query, MAX_DAYWISE_DAYS))),
      ),
  );

  app.get(
    "/reports/tractors",
    { schema: { querystring: reportRangeQuery, response: { 200: tractorReportResponse } } },
    async (request) => tractorReport(ctx.db, await checked(request.query)),
  );
  app.get(
    "/reports/tractors/export",
    { schema: { querystring: reportRangeQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("tractors", request.query),
        tractorReportToCsv(await tractorReport(ctx.db, await checked(request.query))),
      ),
  );

  app.get(
    "/reports/khets",
    { schema: { querystring: reportRangeQuery, response: { 200: khetReportResponse } } },
    async (request) => khetReport(ctx.db, await checked(request.query)),
  );
  app.get(
    "/reports/khets/export",
    { schema: { querystring: reportRangeQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("khets", request.query),
        khetReportToCsv(await khetReport(ctx.db, await checked(request.query))),
      ),
  );

  app.get(
    "/reports/drivers",
    { schema: { querystring: reportRangeQuery, response: { 200: driverReportResponse } } },
    async (request) => driverReport(ctx.db, await checked(request.query)),
  );
  app.get(
    "/reports/drivers/export",
    { schema: { querystring: reportRangeQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("drivers", request.query),
        driverReportToCsv(await driverReport(ctx.db, await checked(request.query))),
      ),
  );

  app.get(
    "/dashboard",
    { schema: { querystring: dashboardQuery, response: { 200: dashboardResponse } } },
    async (request) => {
      // Also refuses with a clear message until the business settings exist.
      await assertReportRange(ctx.db, { from: request.query.date }, ctx.clock());
      return dashboard(ctx.db, request.query.date, ctx.clock());
    },
  );

  done();
};
