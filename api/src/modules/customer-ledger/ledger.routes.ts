import { type RouteModule } from "../../lib/route.ts";
import { csvFileName, sendCsv } from "../../lib/http.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { balanceOfCustomer, customerBalanceDto } from "./balance.ts";
import { duesResponse, ledgerQuery, ledgerResponse } from "./ledger.schema.ts";
import { customerLedger, duesToCsv, ledgerToCsv, listDues } from "./ledger.service.ts";

export const ledgerRoutes: RouteModule = (app, ctx) => {
  app.get(
    "/customers/:id/ledger",
    { params: idParams, query: ledgerQuery, response: { 200: ledgerResponse } },
    (request) => customerLedger(ctx.db, request.params.id, request.query),
  );

  app.get(
    "/customers/:id/balance",
    { params: idParams, response: { 200: customerBalanceDto } },
    (request) => balanceOfCustomer(ctx.db, request.params.id),
  );

  app.get(
    "/customers/:id/ledger/export",
    { params: idParams, query: ledgerQuery },
    async (request) => {
      const ledger = await customerLedger(ctx.db, request.params.id, request.query);
      const name = csvFileName(`ledger_customer_${String(request.params.id)}`, request.query);
      return sendCsv(name, ledgerToCsv(ledger));
    },
  );

  app.get("/dues", { response: { 200: duesResponse } }, () => listDues(ctx.db, ctx.clock()));

  app.get("/dues/export", {}, async () => {
    const dues = await listDues(ctx.db, ctx.clock());
    return sendCsv(`dues_${dues.asOf}.csv`, duesToCsv(dues));
  });
};
