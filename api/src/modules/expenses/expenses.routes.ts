import { type RouteModule } from "../../lib/route.ts";
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

export const expenseRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/expenses",
    { body: expenseCreateBody, response: { 201: expenseSavedResponse } },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(await createExpense(ctx.db, request.body, key, ctx.clock()));
    },
  );

  app.get(
    "/expenses",
    { query: expenseListQuery, response: { 200: expensePageResponse } },
    (request) => listExpenses(ctx.db, request.query),
  );

  app.get("/expenses/export", { query: expenseFilterQuery }, async (request) =>
    sendCsv(csvFileName("expenses", request.query), await exportExpenses(ctx.db, request.query)),
  );

  app.get("/expenses/:id", { params: idParams, response: { 200: expenseDto } }, (request) =>
    getExpense(ctx.db, request.params.id),
  );

  app.patch(
    "/expenses/:id",
    {
      params: idParams,
      body: expenseUpdateBody,
      response: { 200: expenseSavedResponse },
    },
    (request) => updateExpense(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete("/expenses/:id", { params: idParams, response: { 200: expenseDto } }, (request) =>
    deleteExpense(ctx.db, request.params.id, ctx.clock()),
  );

  app.post(
    "/expenses/:id/restore",
    { params: idParams, response: { 200: expenseDto } },
    (request) => restoreExpense(ctx.db, request.params.id, ctx.clock()),
  );
};
