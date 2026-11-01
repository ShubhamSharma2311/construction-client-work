import { type RouteModule } from "../../lib/route.ts";
import { dateRangeSchema } from "../../lib/dates.ts";
import { csvFileName, sendCsv, sendIdempotent } from "../../lib/http.ts";
import { readIdempotencyKey } from "../../lib/idempotency.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { assertReportRange } from "../reports/report-range.ts";
import { partnerShareResponse, reportRangeQuery } from "../reports/reports.schema.ts";
import { partnerShare } from "./partner-share.service.ts";
import {
  partnerLedgerResponse,
  partnerTxnBody,
  partnerTxnFilterQuery,
  partnerTxnListQuery,
  partnerTxnPageResponse,
  partnerTxnSavedResponse,
  partnerTxnUpdateBody,
} from "./partner-account.schema.ts";
import {
  deletePartnerTxn,
  exportPartnerTxns,
  listPartnerTxns,
  partnerLedger,
  recordPartnerTxn,
  updatePartnerTxn,
} from "./partner-account.service.ts";

export const partnerAccountRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/partners/:id/txns",
    {
      params: idParams,
      body: partnerTxnBody,
      response: { 201: partnerTxnSavedResponse },
    },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        await recordPartnerTxn(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.get(
    "/partners/:id/ledger",
    {
      params: idParams,
      query: dateRangeSchema,
      response: { 200: partnerLedgerResponse },
    },
    (request) => partnerLedger(ctx.db, request.params.id, request.query),
  );

  app.get(
    "/partner-txns",
    { query: partnerTxnListQuery, response: { 200: partnerTxnPageResponse } },
    (request) => listPartnerTxns(ctx.db, request.query),
  );

  app.get("/partner-txns/export", { query: partnerTxnFilterQuery }, async (request) =>
    sendCsv(
      csvFileName("partner_transactions", request.query),
      await exportPartnerTxns(ctx.db, request.query),
    ),
  );

  app.patch(
    "/partner-txns/:id",
    {
      params: idParams,
      body: partnerTxnUpdateBody,
      response: { 200: partnerTxnSavedResponse },
    },
    (request) => updatePartnerTxn(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete(
    "/partner-txns/:id",
    { params: idParams, response: { 200: partnerTxnSavedResponse } },
    (request) => deletePartnerTxn(ctx.db, request.params.id, ctx.clock()),
  );
  app.get(
    "/partners/:id/share",
    {
      params: idParams,
      query: reportRangeQuery,
      response: { 200: partnerShareResponse },
    },
    async (request) => {
      await assertReportRange(ctx.db, request.query, ctx.clock());
      return partnerShare(ctx.db, request.params.id, request.query);
    },
  );
};
