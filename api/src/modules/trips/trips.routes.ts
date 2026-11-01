import { type RouteModule } from "../../lib/route.ts";
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

export const tripRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/trips",
    { body: tripCreateBody, response: { 201: tripSavedResponse } },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      return sendIdempotent(await createTrip(ctx.db, request.body, key, ctx.clock()));
    },
  );

  app.get("/trips", { query: tripListQuery, response: { 200: tripPageResponse } }, (request) =>
    listTrips(ctx.db, request.query),
  );

  app.get("/trips/export", { query: tripFilterQuery }, async (request) =>
    sendCsv(csvFileName("trips", request.query), await exportTrips(ctx.db, request.query)),
  );

  app.get("/trips/:id", { params: idParams, response: { 200: tripDto } }, (request) =>
    getTrip(ctx.db, request.params.id),
  );

  app.patch(
    "/trips/:id",
    { params: idParams, body: tripUpdateBody, response: { 200: tripSavedResponse } },
    (request) => updateTrip(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.delete(
    "/trips/:id",
    {
      params: idParams,
      query: tripDeleteQuery,
      response: { 200: tripDeletedResponse },
    },
    (request) =>
      deleteTrip(ctx.db, request.params.id, request.query.releasePayments === "true", ctx.clock()),
  );

  app.post(
    "/trips/:id/restore",
    { params: idParams, response: { 200: tripSavedResponse } },
    (request) => restoreTrip(ctx.db, request.params.id, ctx.clock()),
  );

  app.post(
    "/customers/:id/opening-balance",
    { params: idParams, body: openingBalanceBody, response: { 201: tripSavedResponse } },
    async (request) => {
      const key = readIdempotencyKey(request.headers);
      const result = await createOpeningBalance(
        ctx.db,
        request.params.id,
        request.body,
        key,
        ctx.clock(),
      );
      return sendIdempotent(result);
    },
  );
};
