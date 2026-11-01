import type { FastifyReply } from "fastify";
import type { FastifyPluginCallbackZod } from "fastify-type-provider-zod";
import { z } from "zod";
import type { AppContext } from "../../app-context.ts";
import {
  type BrowserSession,
  browserSessionResponse,
  changePasswordBody,
  forgotPasswordBody,
  loginBody,
  meResponse,
  resetPasswordBody,
  type Session,
  setEmailBody,
} from "./auth.schema.ts";
import { changePassword, getMe, login, logout, refreshSession } from "./auth.service.ts";
import { requestPasswordReset, resetPassword, setOwnerEmail } from "./password-reset.service.ts";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./refresh-cookie.ts";

function sendSession(reply: FastifyReply, session: Session, secure: boolean): BrowserSession {
  setRefreshCookie(reply, session.refreshToken, session.refreshTokenExpiresAt, secure);
  return { accessToken: session.accessToken, accessTokenExpiresAt: session.accessTokenExpiresAt };
}

/** Reachable without a token. */
export const authPublicRoutes: FastifyPluginCallbackZod<AppContext> = (app, ctx, done) => {
  app.post(
    "/auth/login",
    { schema: { body: loginBody, response: { 200: browserSessionResponse } } },
    async (request, reply) => {
      const input = { ...request.body, ip: request.ip };
      const session = await login(ctx.db, input, ctx.jwtSecret, ctx.clock());
      return sendSession(reply, session, ctx.secureCookies);
    },
  );

  app.post(
    "/auth/refresh",
    { schema: { response: { 200: browserSessionResponse } } },
    async (request, reply) => {
      const token = readRefreshCookie(request, ctx.secureCookies);
      const session = await refreshSession(ctx.db, token, ctx.jwtSecret, ctx.clock());
      return sendSession(reply, session, ctx.secureCookies);
    },
  );

  app.post("/auth/logout", { schema: { response: { 204: z.null() } } }, async (request, reply) => {
    await logout(ctx.db, readRefreshCookie(request, ctx.secureCookies), ctx.clock());
    clearRefreshCookie(reply, ctx.secureCookies);
    return reply.status(204).send(null);
  });

  app.post(
    "/auth/forgot-password",
    { schema: { body: forgotPasswordBody, response: { 204: z.null() } } },
    async (request, reply) => {
      const resetRequest = { username: request.body.username, appUrl: ctx.appUrl };
      await requestPasswordReset(ctx.db, ctx.mailer, resetRequest, ctx.clock());
      return reply.status(204).send(null);
    },
  );

  app.post(
    "/auth/reset-password",
    { schema: { body: resetPasswordBody, response: { 204: z.null() } } },
    async (request, reply) => {
      await resetPassword(ctx.db, request.body, ctx.clock());
      // Every login was just signed out, this browser's included.
      clearRefreshCookie(reply, ctx.secureCookies);
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

  app.put(
    "/auth/email",
    { schema: { body: setEmailBody, response: { 200: meResponse } } },
    (request) => setOwnerEmail(ctx.db, request.userId, request.body),
  );

  app.post(
    "/auth/change-password",
    { schema: { body: changePasswordBody, response: { 204: z.null() } } },
    async (request, reply) => {
      await changePassword(ctx.db, request.userId, request.body, ctx.clock());
      // Every login was just signed out, this browser's included.
      clearRefreshCookie(reply, ctx.secureCookies);
      return reply.status(204).send(null);
    },
  );
  done();
};
