import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { labourerCreateBody, labourerDto, labourerUpdateBody } from "./labourers.schema.ts";
import { createLabourer, getLabourer, listLabourers, updateLabourer } from "./labourers.service.ts";

export const labourerRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/labourers",
    { schema: { body: labourerCreateBody, response: { 201: labourerDto } } },
    async (request, reply) => reply.status(201).send(await createLabourer(ctx.db, request.body)),
  );

  app.get(
    "/labourers",
    { schema: { querystring: masterListQuery, response: { 200: pageSchema(labourerDto) } } },
    (request) => listLabourers(ctx.db, request.query),
  );

  app.get(
    "/labourers/:id",
    { schema: { params: idParams, response: { 200: labourerDto } } },
    (request) => getLabourer(ctx.db, request.params.id),
  );

  app.patch(
    "/labourers/:id",
    { schema: { params: idParams, body: labourerUpdateBody, response: { 200: labourerDto } } },
    (request) => updateLabourer(ctx.db, request.params.id, request.body),
  );
  done();
};
