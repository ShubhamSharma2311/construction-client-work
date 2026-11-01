import { type RouteModule, respond } from "../../lib/route.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { labourerCreateBody, labourerDto, labourerUpdateBody } from "./labourers.schema.ts";
import { createLabourer, getLabourer, listLabourers, updateLabourer } from "./labourers.service.ts";

export const labourerRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/labourers",
    { body: labourerCreateBody, response: { 201: labourerDto } },
    async (request) => respond(201, await createLabourer(ctx.db, request.body)),
  );

  app.get(
    "/labourers",
    { query: masterListQuery, response: { 200: pageSchema(labourerDto) } },
    (request) => listLabourers(ctx.db, request.query),
  );

  app.get("/labourers/:id", { params: idParams, response: { 200: labourerDto } }, (request) =>
    getLabourer(ctx.db, request.params.id),
  );

  app.patch(
    "/labourers/:id",
    { params: idParams, body: labourerUpdateBody, response: { 200: labourerDto } },
    (request) => updateLabourer(ctx.db, request.params.id, request.body),
  );
};
