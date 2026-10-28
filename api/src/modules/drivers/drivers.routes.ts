import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { masterListQuery, pageSchema } from "../../lib/listing.ts";
import { idParams } from "../../lib/request-schemas.ts";
import {
  driverCreateBody,
  driverDto,
  driverUpdateBody,
  driverUpdatedResponse,
  salaryRateBody,
  salaryRateParams,
} from "./drivers.schema.ts";
import {
  addSalaryRate,
  createDriver,
  deleteSalaryRate,
  getDriver,
  listDrivers,
  updateDriver,
} from "./drivers.service.ts";

export const driverRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/drivers",
    { schema: { body: driverCreateBody, response: { 201: driverDto } } },
    async (request, reply) =>
      reply.status(201).send(await createDriver(ctx.db, request.body, ctx.clock())),
  );

  app.get(
    "/drivers",
    { schema: { querystring: masterListQuery, response: { 200: pageSchema(driverDto) } } },
    (request) => listDrivers(ctx.db, request.query, ctx.clock()),
  );

  app.get(
    "/drivers/:id",
    { schema: { params: idParams, response: { 200: driverDto } } },
    (request) => getDriver(ctx.db, request.params.id, ctx.clock()),
  );

  app.patch(
    "/drivers/:id",
    {
      schema: {
        params: idParams,
        body: driverUpdateBody,
        response: { 200: driverUpdatedResponse },
      },
    },
    (request) => updateDriver(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.post(
    "/drivers/:id/salary-rates",
    { schema: { params: idParams, body: salaryRateBody, response: { 201: driverDto } } },
    async (request, reply) =>
      reply
        .status(201)
        .send(await addSalaryRate(ctx.db, request.params.id, request.body, ctx.clock())),
  );

  app.delete(
    "/drivers/:id/salary-rates/:rateId",
    { schema: { params: salaryRateParams, response: { 200: driverDto } } },
    (request) => deleteSalaryRate(ctx.db, request.params.id, request.params.rateId, ctx.clock()),
  );
  done();
};
