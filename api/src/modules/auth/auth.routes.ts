import type { Context } from "hono";
import { type RouteModule, respond } from "../../lib/route.ts";
import { z } from "zod";
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
  setupOwnerBody,
} from "./auth.schema.ts";
import {
  changePassword,
  getMe,
  login,
  logout,
  refreshSession,
  setupOwner,
} from "./auth.service.ts";
import { requestPasswordReset, resetPassword, setOwnerEmail } from "./password-reset.service.ts";
import { clearRefreshCookie, readRefreshCookie, setRefreshCookie } from "./refresh-cookie.ts";

function sendSession(c: Context, session: Session, secure: boolean): BrowserSession {
  setRefreshCookie(c, session.refreshToken, session.refreshTokenExpiresAt, secure);
  return { accessToken: session.accessToken, accessTokenExpiresAt: session.accessTokenExpiresAt };
}

/** Reachable without a token. */
export const authPublicRoutes: RouteModule = (app, ctx) => {
  app.post(
    "/auth/login",
    { body: loginBody, response: { 200: browserSessionResponse } },
    async (request) => {
      const input = { ...request.body, ip: request.ip };
      const session = await login(ctx.db, input, ctx.jwtSecret, ctx.clock());
      return sendSession(request.context, session, ctx.secureCookies);
    },
  );

  app.post("/auth/refresh", { response: { 200: browserSessionResponse } }, async (request) => {
    const token = readRefreshCookie(request.context, ctx.secureCookies);
    const session = await refreshSession(ctx.db, token, ctx.jwtSecret, ctx.clock());
    return sendSession(request.context, session, ctx.secureCookies);
  });

  app.post("/auth/logout", { response: { 204: z.null() } }, async (request) => {
    await logout(ctx.db, readRefreshCookie(request.context, ctx.secureCookies), ctx.clock());
    clearRefreshCookie(request.context, ctx.secureCookies);
    return respond(204, null);
  });

  const { setupToken } = ctx;
  if (setupToken !== undefined) {
    app.post(
      "/auth/setup-owner",
      { body: setupOwnerBody, response: { 201: meResponse } },
      async (request) => {
        const owner = await setupOwner(ctx.db, request.body, setupToken);
        return respond(201, owner);
      },
    );
  }

  app.post(
    "/auth/forgot-password",
    { body: forgotPasswordBody, response: { 204: z.null() } },
    async (request) => {
      const resetRequest = { username: request.body.username, appUrl: ctx.appUrl };
      await requestPasswordReset(ctx.db, ctx.mailer, resetRequest, ctx.clock());
      return respond(204, null);
    },
  );

  app.post(
    "/auth/reset-password",
    { body: resetPasswordBody, response: { 204: z.null() } },
    async (request) => {
      await resetPassword(ctx.db, request.body, ctx.clock());
      // Every login was just signed out, this browser's included.
      clearRefreshCookie(request.context, ctx.secureCookies);
      return respond(204, null);
    },
  );
};

/** Registered inside the authenticated scope. */
export const authPrivateRoutes: RouteModule = (app, ctx) => {
  app.get("/auth/me", { response: { 200: meResponse } }, (request) =>
    getMe(ctx.db, request.userId),
  );

  app.put("/auth/email", { body: setEmailBody, response: { 200: meResponse } }, (request) =>
    setOwnerEmail(ctx.db, request.userId, request.body, ctx.clock()),
  );

  app.post(
    "/auth/change-password",
    { body: changePasswordBody, response: { 204: z.null() } },
    async (request) => {
      await changePassword(ctx.db, request.userId, request.body, ctx.clock());
      // Every login was just signed out, this browser's included.
      clearRefreshCookie(request.context, ctx.secureCookies);
      return respond(204, null);
    },
  );
};
