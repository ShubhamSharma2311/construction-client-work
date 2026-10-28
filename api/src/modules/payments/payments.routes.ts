import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { csvFileName, sendCsv, sendIdempotent } from "../../lib/http.ts";
import { readIdempotencyKey } from "../../lib/idempotency.ts";
import { idParams } from "../../lib/request-schemas.ts";
import {
  creditAppliedResponse,
  paymentCreateBody,
  paymentDto,
  paymentFilterQuery,
  paymentListQuery,
  paymentPageResponse,
  paymentSavedResponse,
  paymentUpdateBody,
} from "./payments.schema.ts";
import {
  applyCredit,
  createPayment,
  exportPayments,
  getPayment,
  listPayments,
  reversePayment,
  updatePayment,
} from "./payments.service.ts";

export const paymentRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/customers/:id/payments",
    {
      schema: {
        params: idParams,
        body: paymentCreateBody,
        response: { 201: paymentSavedResponse },
      },
    },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      const result = await createPayment(ctx.db, request.params.id, request.body, key, ctx.clock());
      return sendIdempotent(reply, result);
    },
  );

  app.post(
    "/customers/:id/apply-credit",
    { schema: { params: idParams, response: { 200: creditAppliedResponse } } },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(reply, await applyCredit(ctx.db, request.params.id, key));
    },
  );

  app.get(
    "/payments",
    { schema: { querystring: paymentListQuery, response: { 200: paymentPageResponse } } },
    (request) => listPayments(ctx.db, request.query),
  );

  app.get(
    "/payments/export",
    { schema: { querystring: paymentFilterQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("payments", request.query),
        await exportPayments(ctx.db, request.query),
      ),
  );

  app.get(
    "/payments/:id",
    { schema: { params: idParams, response: { 200: paymentDto } } },
    (request) => getPayment(ctx.db, request.params.id),
  );

  app.patch(
    "/payments/:id",
    {
      schema: {
        params: idParams,
        body: paymentUpdateBody,
        response: { 200: paymentSavedResponse },
      },
    },
    (request) => updatePayment(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete(
    "/payments/:id",
    { schema: { params: idParams, response: { 200: paymentSavedResponse } } },
    (request) => reversePayment(ctx.db, request.params.id, ctx.clock()),
  );
  done();
};
