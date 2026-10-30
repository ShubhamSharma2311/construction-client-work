import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { csvFileName, sendCsv } from "../../lib/http.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { balanceOfCustomer, customerBalanceDto } from "./balance.ts";
import { duesResponse, ledgerQuery, ledgerResponse } from "./ledger.schema.ts";
import { customerLedger, duesToCsv, ledgerToCsv, listDues } from "./ledger.service.ts";

export const ledgerRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.get(
    "/customers/:id/ledger",
    { schema: { params: idParams, querystring: ledgerQuery, response: { 200: ledgerResponse } } },
    (request) => customerLedger(ctx.db, request.params.id, request.query),
  );

  app.get(
    "/customers/:id/balance",
    { schema: { params: idParams, response: { 200: customerBalanceDto } } },
    (request) => balanceOfCustomer(ctx.db, request.params.id),
  );

  app.get(
    "/customers/:id/ledger/export",
    { schema: { params: idParams, querystring: ledgerQuery } },
    async (request, reply) => {
      const ledger = await customerLedger(ctx.db, request.params.id, request.query);
      const name = csvFileName(`ledger_customer_${String(request.params.id)}`, request.query);
      return sendCsv(reply, name, ledgerToCsv(ledger));
    },
  );

  app.get("/dues", { schema: { response: { 200: duesResponse } } }, () =>
    listDues(ctx.db, ctx.clock()),
  );

  app.get("/dues/export", async (_request, reply) => {
    const dues = await listDues(ctx.db, ctx.clock());
    return sendCsv(reply, `dues_${dues.asOf}.csv`, duesToCsv(dues));
  });
  done();
};
