import { type RouteModule, respond } from "../../lib/route.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { partnerCreateBody, partnerDto, partnerUpdateBody } from "./partners.schema.ts";
import { createPartner, getPartner, listPartners, updatePartner } from "./partners.service.ts";

export const partnerRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/partners",
    { body: partnerCreateBody, response: { 201: partnerDto } },
    async (request) => respond(201, await createPartner(ctx.db, request.body)),
  );

  app.get(
    "/partners",
    { query: masterListQuery, response: { 200: pageSchema(partnerDto) } },
    (request) => listPartners(ctx.db, request.query),
  );

  app.get("/partners/:id", { params: idParams, response: { 200: partnerDto } }, (request) =>
    getPartner(ctx.db, request.params.id),
  );

  app.patch(
    "/partners/:id",
    { params: idParams, body: partnerUpdateBody, response: { 200: partnerDto } },
    (request) => updatePartner(ctx.db, request.params.id, request.body),
  );
};
