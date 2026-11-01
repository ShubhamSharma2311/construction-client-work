import { z } from "zod";
import { type RouteModule, respond } from "../../lib/route.ts";
import { sendIdempotent } from "../../lib/http.ts";
import { readIdempotencyKey } from "../../lib/idempotency.ts";
import { idParams } from "../../lib/request-schemas.ts";
import {
  emiDueQuery,
  emiDueResponse,
  emiPaymentBody,
  foreclosureBody,
  loanCreateBody,
  loanDetailDto,
  loanDto,
  loanListQuery,
  loanPaymentParams,
  loanPaymentSavedResponse,
  loanUpdateBody,
} from "./loans.schema.ts";
import {
  createLoan,
  deleteLoan,
  emiDue,
  forecloseLoan,
  getLoan,
  listLoans,
  payEmi,
  reverseLoanPayment,
  updateLoan,
} from "./loans.service.ts";

export const loanRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/tractors/:id/loans",
    { params: idParams, body: loanCreateBody, response: { 201: loanDetailDto } },
    async (request) =>
      respond(201, await createLoan(ctx.db, request.params.id, request.body, ctx.clock())),
  );

  app.get("/loans", { query: loanListQuery, response: { 200: z.array(loanDto) } }, (request) =>
    listLoans(ctx.db, request.query, ctx.clock()),
  );

  app.get("/loans/:id", { params: idParams, response: { 200: loanDetailDto } }, (request) =>
    getLoan(ctx.db, request.params.id, ctx.clock()),
  );

  app.patch(
    "/loans/:id",
    { params: idParams, body: loanUpdateBody, response: { 200: loanDetailDto } },
    (request) => updateLoan(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete("/loans/:id", { params: idParams, response: { 204: z.null() } }, async (request) => {
    await deleteLoan(ctx.db, request.params.id);
    return respond(204, null);
  });

  app.post(
    "/loans/:id/emi",
    {
      params: idParams,
      body: emiPaymentBody,
      response: { 201: loanPaymentSavedResponse },
    },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        await payEmi(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.post(
    "/loans/:id/foreclose",
    {
      params: idParams,
      body: foreclosureBody,
      response: { 201: loanPaymentSavedResponse },
    },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        await forecloseLoan(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.delete(
    "/loans/:id/payments/:expenseId",
    { params: loanPaymentParams, response: { 200: loanDetailDto } },
    (request) =>
      reverseLoanPayment(ctx.db, request.params.id, request.params.expenseId, ctx.clock()),
  );

  app.get("/emi/due", { query: emiDueQuery, response: { 200: emiDueResponse } }, (request) =>
    emiDue(ctx.db, request.query, ctx.clock()),
  );
};
