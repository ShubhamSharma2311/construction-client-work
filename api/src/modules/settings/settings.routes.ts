import { type RouteModule } from "../../lib/route.ts";
import { settingsBody, settingsResponse } from "./settings.schema.ts";
import { getSettings, saveSettings } from "./settings.service.ts";

export const settingsRoutes: RouteModule = (app, ctx) => {
  app.get("/settings", { response: { 200: settingsResponse } }, () => getSettings(ctx.db));

  app.put("/settings", { body: settingsBody, response: { 200: settingsResponse } }, (request) =>
    saveSettings(ctx.db, request.body, ctx.clock()),
  );
};
