import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { khetCreateBody, khetDto, khetUpdateBody } from "./khets.schema.ts";
import { createKhet, getKhet, listKhets, updateKhet } from "./khets.service.ts";

export const khetRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/khets",
    { schema: { body: khetCreateBody, response: { 201: khetDto } } },
    async (request, reply) => reply.status(201).send(await createKhet(ctx.db, request.body)),
  );

  app.get(
    "/khets",
    { schema: { querystring: masterListQuery, response: { 200: pageSchema(khetDto) } } },
    (request) => listKhets(ctx.db, request.query),
  );

  app.get("/khets/:id", { schema: { params: idParams, response: { 200: khetDto } } }, (request) =>
    getKhet(ctx.db, request.params.id),
  );

  app.patch(
    "/khets/:id",
    { schema: { params: idParams, body: khetUpdateBody, response: { 200: khetDto } } },
    (request) => updateKhet(ctx.db, request.params.id, request.body),
  );
  done();
};
