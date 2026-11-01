import type { AppContext } from "../../app-context.ts";
import { AppError } from "../../lib/errors.ts";
import { verifyAccessToken } from "./tokens.ts";

const BEARER = /^Bearer ([A-Za-z0-9._-]+)$/;

/** The owner signed in by the request's bearer token; anything else is a 401. */
export async function authenticate(
  authorization: string | undefined,
  ctx: Pick<AppContext, "jwtSecret" | "clock">,
): Promise<number> {
  const match = BEARER.exec(authorization ?? "");
  if (!match?.[1]) throw new AppError("UNAUTHORIZED", "Log in first: missing bearer token");
  return verifyAccessToken(match[1], ctx.jwtSecret, ctx.clock());
}
