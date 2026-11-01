import { type RouteModule, respond } from "../../lib/route.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import {
  tractorCreateBody,
  tractorDto,
  tractorUpdateBody,
  tractorUpdatedResponse,
} from "./tractors.schema.ts";
import { createTractor, getTractor, listTractors, updateTractor } from "./tractors.service.ts";

export const tractorRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/tractors",
    { body: tractorCreateBody, response: { 201: tractorDto } },
    async (request) => respond(201, await createTractor(ctx.db, request.body)),
  );

  app.get(
    "/tractors",
    { query: masterListQuery, response: { 200: pageSchema(tractorDto) } },
    (request) => listTractors(ctx.db, request.query),
  );

  app.get("/tractors/:id", { params: idParams, response: { 200: tractorDto } }, (request) =>
    getTractor(ctx.db, request.params.id),
  );

  app.patch(
    "/tractors/:id",
    {
      params: idParams,
      body: tractorUpdateBody,
      response: { 200: tractorUpdatedResponse },
    },
    (request) => updateTractor(ctx.db, request.params.id, request.body),
  );
};
