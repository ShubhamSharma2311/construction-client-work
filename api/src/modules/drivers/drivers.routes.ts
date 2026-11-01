import { type RouteModule, respond } from "../../lib/route.ts";
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

export const driverRoutes: RouteModule = (app, ctx) => {
  app.post("/drivers", { body: driverCreateBody, response: { 201: driverDto } }, async (request) =>
    respond(201, await createDriver(ctx.db, request.body, ctx.clock())),
  );

  app.get(
    "/drivers",
    { query: masterListQuery, response: { 200: pageSchema(driverDto) } },
    (request) => listDrivers(ctx.db, request.query, ctx.clock()),
  );

  app.get("/drivers/:id", { params: idParams, response: { 200: driverDto } }, (request) =>
    getDriver(ctx.db, request.params.id, ctx.clock()),
  );

  app.patch(
    "/drivers/:id",
    {
      params: idParams,
      body: driverUpdateBody,
      response: { 200: driverUpdatedResponse },
    },
    (request) => updateDriver(ctx.db, request.params.id, request.body, ctx.clock()),
  );

  app.post(
    "/drivers/:id/salary-rates",
    { params: idParams, body: salaryRateBody, response: { 201: driverDto } },
    async (request) =>
      respond(201, await addSalaryRate(ctx.db, request.params.id, request.body, ctx.clock())),
  );

  app.delete(
    "/drivers/:id/salary-rates/:rateId",
    { params: salaryRateParams, response: { 200: driverDto } },
    (request) => deleteSalaryRate(ctx.db, request.params.id, request.params.rateId, ctx.clock()),
  );
};
