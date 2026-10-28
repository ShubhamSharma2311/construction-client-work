import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { Db } from "../../lib/prisma.ts";
import { checkDatabase } from "./health.service.ts";

const healthResponse = z.object({
  status: z.enum(["ok", "unavailable"]),
  database: z.enum(["ok", "unreachable"]),
});

export const healthRoutes: FastifyPluginCallbackZod<{ db: Db }> = (app, { db }, done) => {
  app.get(
    "/health",
    { schema: { response: { 200: healthResponse, 503: healthResponse } } },
    async (request, reply) => {
      const database = await checkDatabase(db, request.log);
      if (database === "ok") return { status: "ok" as const, database };
      return reply.status(503).send({ status: "unavailable", database });
    },
  );
  done();
};
