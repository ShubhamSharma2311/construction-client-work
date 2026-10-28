import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppContext } from "../../app-context.ts";
import {
  changePasswordBody,
  loginBody,
  meResponse,
  refreshBody,
  sessionResponse,
} from "./auth.schema.ts";
import { changePassword, getMe, login, logout, refreshSession } from "./auth.service.ts";

/** Reachable without a token. */
export const authPublicRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/auth/login",
    { schema: { body: loginBody, response: { 200: sessionResponse } } },
    (request) => login(ctx.db, { ...request.body, ip: request.ip }, ctx.jwtSecret, ctx.clock()),
  );

  app.post(
    "/auth/refresh",
    { schema: { body: refreshBody, response: { 200: sessionResponse } } },
    (request) => refreshSession(ctx.db, request.body.refreshToken, ctx.jwtSecret, ctx.clock()),
  );

  app.post(
    "/auth/logout",
    { schema: { body: refreshBody, response: { 204: z.null() } } },
    async (request, reply) => {
      await logout(ctx.db, request.body.refreshToken, ctx.clock());
      return reply.status(204).send(null);
    },
  );
  done();
};

/** Registered inside the authenticated scope. */
export const authPrivateRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.get("/auth/me", { schema: { response: { 200: meResponse } } }, (request) =>
    getMe(ctx.db, request.userId),
  );

  app.post(
    "/auth/change-password",
    { schema: { body: changePasswordBody, response: { 204: z.null() } } },
    async (request, reply) => {
      await changePassword(ctx.db, request.userId, request.body, ctx.clock());
      return reply.status(204).send(null);
    },
  );
  done();
};
