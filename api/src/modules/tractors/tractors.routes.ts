import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import {
  tractorCreateBody,
  tractorDto,
  tractorUpdateBody,
  tractorUpdatedResponse,
} from "./tractors.schema.ts";
import { createTractor, getTractor, listTractors, updateTractor } from "./tractors.service.ts";

export const tractorRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/tractors",
    { schema: { body: tractorCreateBody, response: { 201: tractorDto } } },
    async (request, reply) => reply.status(201).send(await createTractor(ctx.db, request.body)),
  );

  app.get(
    "/tractors",
    { schema: { querystring: masterListQuery, response: { 200: pageSchema(tractorDto) } } },
    (request) => listTractors(ctx.db, request.query),
  );

  app.get(
    "/tractors/:id",
    { schema: { params: idParams, response: { 200: tractorDto } } },
    (request) => getTractor(ctx.db, request.params.id),
  );

  app.patch(
    "/tractors/:id",
    {
      schema: {
        params: idParams,
        body: tractorUpdateBody,
        response: { 200: tractorUpdatedResponse },
      },
    },
    (request) => updateTractor(ctx.db, request.params.id, request.body),
  );
  done();
};
