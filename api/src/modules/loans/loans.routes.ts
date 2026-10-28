import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppContext } from "../../app-context.ts";
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

export const loanRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/tractors/:id/loans",
    { schema: { params: idParams, body: loanCreateBody, response: { 201: loanDetailDto } } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await createLoan(ctx.db, request.params.id, request.body, ctx.clock())),
  );

  app.get(
    "/loans",
    { schema: { querystring: loanListQuery, response: { 200: z.array(loanDto) } } },
    (request) => listLoans(ctx.db, request.query, ctx.clock()),
  );

  app.get(
    "/loans/:id",
    { schema: { params: idParams, response: { 200: loanDetailDto } } },
    (request) => getLoan(ctx.db, request.params.id, ctx.clock()),
  );

  app.patch(
    "/loans/:id",
    { schema: { params: idParams, body: loanUpdateBody, response: { 200: loanDetailDto } } },
    (request) => updateLoan(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete(
    "/loans/:id",
    { schema: { params: idParams, response: { 204: z.null() } } },
    async (request, reply) => {
      await deleteLoan(ctx.db, request.params.id);
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/loans/:id/emi",
    {
      schema: {
        params: idParams,
        body: emiPaymentBody,
        response: { 201: loanPaymentSavedResponse },
      },
    },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        reply,
        await payEmi(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.post(
    "/loans/:id/foreclose",
    {
      schema: {
        params: idParams,
        body: foreclosureBody,
        response: { 201: loanPaymentSavedResponse },
      },
    },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(
        reply,
        await forecloseLoan(ctx.db, request.params.id, request.body, key, ctx.clock()),
      );
    },
  );

  app.delete(
    "/loans/:id/payments/:expenseId",
    { schema: { params: loanPaymentParams, response: { 200: loanDetailDto } } },
    (request) =>
      reverseLoanPayment(ctx.db, request.params.id, request.params.expenseId, ctx.clock()),
  );

  app.get(
    "/emi/due",
    { schema: { querystring: emiDueQuery, response: { 200: emiDueResponse } } },
    (request) => emiDue(ctx.db, request.query, ctx.clock()),
  );
  done();
};
