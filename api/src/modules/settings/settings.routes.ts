import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import type { AppContext } from "../../app-context.ts";
import { settingsBody, settingsResponse } from "./settings.schema.ts";
import { getSettings, saveSettings } from "./settings.service.ts";

export const settingsRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.get("/settings", { schema: { response: { 200: settingsResponse } } }, () =>
    getSettings(ctx.db),
  );

  app.put(
    "/settings",
    { schema: { body: settingsBody, response: { 200: settingsResponse } } },
    (request) => saveSettings(ctx.db, request.body, ctx.clock()),
  );
  done();
};
