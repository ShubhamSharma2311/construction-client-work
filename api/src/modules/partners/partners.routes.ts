import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { partnerCreateBody, partnerDto, partnerUpdateBody } from "./partners.schema.ts";
import { createPartner, getPartner, listPartners, updatePartner } from "./partners.service.ts";

export const partnerRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/partners",
    { schema: { body: partnerCreateBody, response: { 201: partnerDto } } },
    async (request, reply) => reply.status(201).send(await createPartner(ctx.db, request.body)),
  );

  app.get(
    "/partners",
    { schema: { querystring: masterListQuery, response: { 200: pageSchema(partnerDto) } } },
    (request) => listPartners(ctx.db, request.query),
  );

  app.get(
    "/partners/:id",
    { schema: { params: idParams, response: { 200: partnerDto } } },
    (request) => getPartner(ctx.db, request.params.id),
  );

  app.patch(
    "/partners/:id",
    { schema: { params: idParams, body: partnerUpdateBody, response: { 200: partnerDto } } },
    (request) => updatePartner(ctx.db, request.params.id, request.body),
  );
  done();
};
