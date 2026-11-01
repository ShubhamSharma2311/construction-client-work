import { type RouteModule } from "../../lib/route.ts";
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

export const paymentRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/customers/:id/payments",
    {
      params: idParams,
      body: paymentCreateBody,
      response: { 201: paymentSavedResponse },
    },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      const result = await createPayment(ctx.db, request.params.id, request.body, key, ctx.clock());
      return sendIdempotent(result);
    },
  );

  app.post(
    "/customers/:id/apply-credit",
    { params: idParams, response: { 200: creditAppliedResponse } },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(await applyCredit(ctx.db, request.params.id, key));
    },
  );

  app.get(
    "/payments",
    { query: paymentListQuery, response: { 200: paymentPageResponse } },
    (request) => listPayments(ctx.db, request.query),
  );

  app.get("/payments/export", { query: paymentFilterQuery }, async (request) =>
    sendCsv(csvFileName("payments", request.query), await exportPayments(ctx.db, request.query)),
  );

  app.get("/payments/:id", { params: idParams, response: { 200: paymentDto } }, (request) =>
    getPayment(ctx.db, request.params.id),
  );

  app.patch(
    "/payments/:id",
    {
      params: idParams,
      body: paymentUpdateBody,
      response: { 200: paymentSavedResponse },
    },
    (request) => updatePayment(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete(
    "/payments/:id",
    { params: idParams, response: { 200: paymentSavedResponse } },
    (request) => reversePayment(ctx.db, request.params.id, ctx.clock()),
  );
};
