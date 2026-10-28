import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import {
  customerCreateBody,
  customerCreatedResponse,
  customerDto,
  customerUpdateBody,
} from "./customers.schema.ts";
import { createCustomer, getCustomer, listCustomers, updateCustomer } from "./customers.service.ts";

export const customerRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/customers",
    { schema: { body: customerCreateBody, response: { 201: customerCreatedResponse } } },
    async (request, reply) => reply.status(201).send(await createCustomer(ctx.db, request.body)),
  );

  app.get(
    "/customers",
    { schema: { querystring: masterListQuery, response: { 200: pageSchema(customerDto) } } },
    (request) => listCustomers(ctx.db, request.query),
  );

  app.get(
    "/customers/:id",
    { schema: { params: idParams, response: { 200: customerDto } } },
    (request) => getCustomer(ctx.db, request.params.id),
  );

  app.patch(
    "/customers/:id",
    { schema: { params: idParams, body: customerUpdateBody, response: { 200: customerDto } } },
    (request) => updateCustomer(ctx.db, request.params.id, request.body),
  );
  done();
};
