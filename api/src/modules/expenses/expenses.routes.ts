import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { csvFileName, sendCsv, sendIdempotent } from "../../lib/http.ts";
import { readIdempotencyKey } from "../../lib/idempotency.ts";
import { idParams } from "../../lib/request-schemas.ts";
import {
  expenseCreateBody,
  expenseDto,
  expenseFilterQuery,
  expenseListQuery,
  expensePageResponse,
  expenseSavedResponse,
  expenseUpdateBody,
} from "./expenses.schema.ts";
import {
  createExpense,
  deleteExpense,
  exportExpenses,
  getExpense,
  listExpenses,
  restoreExpense,
  updateExpense,
} from "./expenses.service.ts";

export const expenseRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/expenses",
    { schema: { body: expenseCreateBody, response: { 201: expenseSavedResponse } } },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(reply, await createExpense(ctx.db, request.body, key, ctx.clock()));
    },
  );

  app.get(
    "/expenses",
    { schema: { querystring: expenseListQuery, response: { 200: expensePageResponse } } },
    (request) => listExpenses(ctx.db, request.query),
  );

  app.get(
    "/expenses/export",
    { schema: { querystring: expenseFilterQuery } },
    async (request, reply) =>
      sendCsv(
        reply,
        csvFileName("expenses", request.query),
        await exportExpenses(ctx.db, request.query),
      ),
  );

  app.get(
    "/expenses/:id",
    { schema: { params: idParams, response: { 200: expenseDto } } },
    (request) => getExpense(ctx.db, request.params.id),
  );

  app.patch(
    "/expenses/:id",
    {
      schema: {
        params: idParams,
        body: expenseUpdateBody,
        response: { 200: expenseSavedResponse },
      },
    },
    (request) => updateExpense(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete(
    "/expenses/:id",
    { schema: { params: idParams, response: { 200: expenseDto } } },
    (request) => deleteExpense(ctx.db, request.params.id, ctx.clock()),
  );

  app.post(
    "/expenses/:id/restore",
    { schema: { params: idParams, response: { 200: expenseDto } } },
    (request) => restoreExpense(ctx.db, request.params.id, ctx.clock()),
  );
  done();
};
