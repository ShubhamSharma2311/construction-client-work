import { type RouteModule, respond } from "../../lib/route.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import { khetCreateBody, khetDto, khetUpdateBody } from "./khets.schema.ts";
import { createKhet, getKhet, listKhets, updateKhet } from "./khets.service.ts";

export const khetRoutes: RouteModule = (app, ctx) => {
  app.post("/khets", { body: khetCreateBody, response: { 201: khetDto } }, async (request) =>
    respond(201, await createKhet(ctx.db, request.body)),
  );

  app.get("/khets", { query: masterListQuery, response: { 200: pageSchema(khetDto) } }, (request) =>
    listKhets(ctx.db, request.query),
  );

  app.get("/khets/:id", { params: idParams, response: { 200: khetDto } }, (request) =>
    getKhet(ctx.db, request.params.id),
  );

  app.patch(
    "/khets/:id",
    { params: idParams, body: khetUpdateBody, response: { 200: khetDto } },
    (request) => updateKhet(ctx.db, request.params.id, request.body),
  );
};
