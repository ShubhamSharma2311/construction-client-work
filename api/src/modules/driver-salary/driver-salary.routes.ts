import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { dateRangeSchema } from "../../lib/dates.ts";
import { csvFileName, sendCsv, sendIdempotent } from "../../lib/http.ts";
import { readIdempotencyKey } from "../../lib/idempotency.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { driverLedger } from "./driver-ledger.service.ts";
import {
  exportDriverPayments,
  listDriverPayments,
  payBonus,
  payDriver,
  reverseDriverPayment,
} from "./driver-payments.service.ts";
import {
  accrualSavedResponse,
  bonusBody,
  closeMonthBody,
  driverLedgerResponse,
  driverOpeningBody,
  driverPaymentBody,
  driverPaymentFilterQuery,
  driverPaymentListQuery,
  driverPaymentPageResponse,
  driverPaymentSavedResponse,
  monthParams,
  monthQuery,
  salaryPreviewResponse,
} from "./driver-salary.schema.ts";
import {
  closeMonth,
  removeDriverOpening,
  reopenMonth,
  salaryPreview,
  setDriverOpening,
} from "./driver-salary.service.ts";

export const driverSalaryRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.get(
    "/drivers/:id/salary",
    {
      schema: {
        params: idParams,
        querystring: monthQuery,
        response: { 200: salaryPreviewResponse },
      },
    },
    (request) => salaryPreview(ctx.db, request.params.id, request.query.month),
  );

  app.post(
    "/drivers/:id/close-month",
    { schema: { params: idParams, body: closeMonthBody, response: { 201: accrualSavedResponse } } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await closeMonth(ctx.db, request.params.id, request.body, ctx.clock())),
  );

  app.delete(
    "/drivers/:id/close-month/:month",
    { schema: { params: monthParams, response: { 200: accrualSavedResponse } } },
    (request) => reopenMonth(ctx.db, request.params.id, request.params.month, ctx.clock()),
  );

  app.post(
    "/drivers/:id/opening-balance",
    {
      schema: {
        params: idParams,
        body: driverOpeningBody,
        response: { 201: accrualSavedResponse },
      },
    },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        reply,
        await setDriverOpening(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.delete(
    "/drivers/:id/opening-balance",
    { schema: { params: idParams, response: { 200: accrualSavedResponse } } },
    (request) => removeDriverOpening(ctx.db, request.params.id, ctx.clock()),
  );

  app.post(
    "/drivers/:id/payments",
    {
      schema: {
        params: idParams,
        body: driverPaymentBody,
        response: { 201: driverPaymentSavedResponse },
      },
    },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        reply,
        await payDriver(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.post(
    "/drivers/:id/bonus",
    {
      schema: { params: idParams, body: bonusBody, response: { 201: driverPaymentSavedResponse } },
    },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        reply,
        await payBonus(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.get(
    "/drivers/:id/ledger",
    {
      schema: {
        params: idParams,
        querystring: dateRangeSchema,
        response: { 200: driverLedgerResponse },
      },
    },
    (request) => driverLedger(ctx.db, request.params.id, request.query),
  );

  app.get(
    "/driver-payments",
    {
      schema: { querystring: driverPaymentListQuery, response: { 200: driverPaymentPageResponse } },
    },
    (request) => listDriverPayments(ctx.db, request.query),
  );

  app.get(
    "/driver-payments/export",
    { schema: { querystring: driverPaymentFilterQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("driver_payments", request.query),
        await exportDriverPayments(ctx.db, request.query),
      ),
  );

  app.delete(
    "/driver-payments/:id",
    { schema: { params: idParams, response: { 200: driverPaymentSavedResponse } } },
    (request) => reverseDriverPayment(ctx.db, request.params.id, ctx.clock()),
  );
  done();
};
