import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { dateRangeSchema } from "../../lib/dates.ts";
import { csvFileName, sendCsv, sendIdempotent } from "../../lib/http.ts";
import { readIdempotencyKey } from "../../lib/idempotency.ts";
import { idParams } from "../../lib/request-schemas.ts";
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

export const partnerAccountRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/partners/:id/txns",
    {
      schema: {
        params: idParams,
        body: partnerTxnBody,
        response: { 201: partnerTxnSavedResponse },
      },
    },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        reply,
        await recordPartnerTxn(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.get(
    "/partners/:id/ledger",
    {
      schema: {
        params: idParams,
        querystring: dateRangeSchema,
        response: { 200: partnerLedgerResponse },
      },
    },
    (request) => partnerLedger(ctx.db, request.params.id, request.query),
  );

  app.get(
    "/partner-txns",
    { schema: { querystring: partnerTxnListQuery, response: { 200: partnerTxnPageResponse } } },
    (request) => listPartnerTxns(ctx.db, request.query),
  );

  app.get(
    "/partner-txns/export",
    { schema: { querystring: partnerTxnFilterQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("partner_transactions", request.query),
        await exportPartnerTxns(ctx.db, request.query),
      ),
  );

  app.patch(
    "/partner-txns/:id",
    {
      schema: {
        params: idParams,
        body: partnerTxnUpdateBody,
        response: { 200: partnerTxnSavedResponse },
      },
    },
    (request) => updatePartnerTxn(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete(
    "/partner-txns/:id",
    { schema: { params: idParams, response: { 200: partnerTxnSavedResponse } } },
    (request) => deletePartnerTxn(ctx.db, request.params.id, ctx.clock()),
  );
  done();
};
