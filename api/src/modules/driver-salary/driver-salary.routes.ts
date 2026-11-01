import { respond, type RouteModule } from "../../lib/route.ts";
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

export const driverSalaryRoutes: RouteModule = (app, ctx) => {
  app.get(
    "/drivers/:id/salary",
    {
      params: idParams,
      query: monthQuery,
      response: { 200: salaryPreviewResponse },
    },
    (request) => salaryPreview(ctx.db, request.params.id, request.query.month),
  );

  app.post(
    "/drivers/:id/close-month",
    { params: idParams, body: closeMonthBody, response: { 201: accrualSavedResponse } },
    async (request) =>
      respond(201, await closeMonth(ctx.db, request.params.id, request.body, ctx.clock())),
  );

  app.delete(
    "/drivers/:id/close-month/:month",
    { params: monthParams, response: { 200: accrualSavedResponse } },
    (request) => reopenMonth(ctx.db, request.params.id, request.params.month, ctx.clock()),
  );

  app.post(
    "/drivers/:id/opening-balance",
    {
      params: idParams,
      body: driverOpeningBody,
      response: { 201: accrualSavedResponse },
    },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        await setDriverOpening(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.delete(
    "/drivers/:id/opening-balance",
    { params: idParams, response: { 200: accrualSavedResponse } },
    (request) => removeDriverOpening(ctx.db, request.params.id, ctx.clock()),
  );

  app.post(
    "/drivers/:id/payments",
    {
      params: idParams,
      body: driverPaymentBody,
      response: { 201: driverPaymentSavedResponse },
    },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        await payDriver(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.post(
    "/drivers/:id/bonus",
    { params: idParams, body: bonusBody, response: { 201: driverPaymentSavedResponse } },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        await payBonus(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.get(
    "/drivers/:id/ledger",
    {
      params: idParams,
      query: dateRangeSchema,
      response: { 200: driverLedgerResponse },
    },
    (request) => driverLedger(ctx.db, request.params.id, request.query),
  );

  app.get(
    "/driver-payments",
    { query: driverPaymentListQuery, response: { 200: driverPaymentPageResponse } },
    (request) => listDriverPayments(ctx.db, request.query),
  );

  app.get("/driver-payments/export", { query: driverPaymentFilterQuery }, async (request) =>
    sendCsv(
      csvFileName("driver_payments", request.query),
      await exportDriverPayments(ctx.db, request.query),
    ),
  );

  app.delete(
    "/driver-payments/:id",
    { params: idParams, response: { 200: driverPaymentSavedResponse } },
    (request) => reverseDriverPayment(ctx.db, request.params.id, ctx.clock()),
  );
};
