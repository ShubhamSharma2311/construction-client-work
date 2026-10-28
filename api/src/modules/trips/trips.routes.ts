import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { csvFileName, sendCsv, sendIdempotent } from "../../lib/http.ts";
import { readIdempotencyKey } from "../../lib/idempotency.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { createOpeningBalance } from "./opening-balance.service.ts";
import {
  openingBalanceBody,
  tripCreateBody,
  tripDeleteQuery,
  tripDeletedResponse,
  tripDto,
  tripFilterQuery,
  tripListQuery,
  tripPageResponse,
  tripSavedResponse,
  tripUpdateBody,
} from "./trips.schema.ts";
import {
  createTrip,
  deleteTrip,
  exportTrips,
  getTrip,
  listTrips,
  restoreTrip,
  updateTrip,
} from "./trips.service.ts";

export const tripRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/trips",
    { schema: { body: tripCreateBody, response: { 201: tripSavedResponse } } },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(reply, await createTrip(ctx.db, request.body, key, ctx.clock()));
    },
  );

  app.get(
    "/trips",
    { schema: { querystring: tripListQuery, response: { 200: tripPageResponse } } },
    (request) => listTrips(ctx.db, request.query),
  );

  app.get("/trips/export", { schema: { querystring: tripFilterQuery } }, async (request, reply) =>
    sendCsv(reply, csvFileName("trips", request.query), await exportTrips(ctx.db, request.query)),
  );

  app.get("/trips/:id", { schema: { params: idParams, response: { 200: tripDto } } }, (request) =>
    getTrip(ctx.db, request.params.id),
  );

  app.patch(
    "/trips/:id",
    { schema: { params: idParams, body: tripUpdateBody, response: { 200: tripSavedResponse } } },
    (request) => updateTrip(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete(
    "/trips/:id",
    {
      schema: {
        params: idParams,
        querystring: tripDeleteQuery,
        response: { 200: tripDeletedResponse },
      },
    },
    (request) =>
      deleteTrip(ctx.db, request.params.id, request.query.releasePayments === "true", ctx.clock()),
  );

  app.post(
    "/trips/:id/restore",
    { schema: { params: idParams, response: { 200: tripSavedResponse } } },
    (request) => restoreTrip(ctx.db, request.params.id, ctx.clock()),
  );

  app.post(
    "/customers/:id/opening-balance",
    {
      schema: { params: idParams, body: openingBalanceBody, response: { 201: tripSavedResponse } },
    },
    async (request, reply) => {
      const key = readIdempotencyKey(request.headers);
      const result = await createOpeningBalance(
        ctx.db,
        request.params.id,
        request.body,
        key,
        ctx.clock(),
      );
      return sendIdempotent(reply, result);
    },
  );
  done();
};
