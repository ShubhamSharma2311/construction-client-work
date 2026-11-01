import { type RouteModule, respond } from "../../lib/route.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import {
  customerCreateBody,
  customerCreatedResponse,
  customerDto,
  customerUpdateBody,
} from "./customers.schema.ts";
import { createCustomer, getCustomer, listCustomers, updateCustomer } from "./customers.service.ts";

export const customerRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/customers",
    { body: customerCreateBody, response: { 201: customerCreatedResponse } },
    async (request) => respond(201, await createCustomer(ctx.db, request.body)),
  );

  app.get(
    "/customers",
    { query: masterListQuery, response: { 200: pageSchema(customerDto) } },
    (request) => listCustomers(ctx.db, request.query),
  );

  app.get("/customers/:id", { params: idParams, response: { 200: customerDto } }, (request) =>
    getCustomer(ctx.db, request.params.id),
  );

  app.patch(
    "/customers/:id",
    { params: idParams, body: customerUpdateBody, response: { 200: customerDto } },
    (request) => updateCustomer(ctx.db, request.params.id, request.body),
  );
};
