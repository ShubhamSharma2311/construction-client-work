import { z } from "zod";
import { type RouteModule, respond } from "../../lib/route.ts";
import { checkDatabase } from "./health.service.ts";

const healthResponse = z.object({
  status: z.enum(["ok", "unavailable"]),
  database: z.enum(["ok", "unreachable"]),
});

export const healthRoutes: RouteModule = (app, ctx) => {
  app.get("/health", { response: { 200: healthResponse, 503: healthResponse } }, async () => {
    const database = await checkDatabase(ctx.db, ctx.log);
    if (database === "ok") return { status: "ok" as const, database };
    return respond(503, { status: "unavailable", database });
  });
};
