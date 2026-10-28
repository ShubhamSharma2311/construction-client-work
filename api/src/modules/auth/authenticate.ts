import type { onRequestAsyncHookHandler } from "fastify";
import type { AppContext } from "../../app-context.ts";
import { AppError } from "../../lib/errors.ts";
import { verifyAccessToken } from "./tokens.ts";

declare module "fastify" {
  interface FastifyRequest {
    /** Set by `requireAuth` on every protected route; 0 means not authenticated. */
    userId: number;
  }
}

const BEARER = /^Bearer ([A-Za-z0-9._-]+)$/;

export function requireAuth(ctx: AppContext): onRequestAsyncHookHandler {
  return async (request) => {
    const match = BEARER.exec(request.headers.authorization ?? "");
    if (!match?.[1]) throw new AppError("UNAUTHORIZED", "Log in first: missing bearer token");
    request.userId = await verifyAccessToken(match[1], ctx.jwtSecret, ctx.clock());
  };
}
