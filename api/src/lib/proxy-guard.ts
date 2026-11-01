import { createHash, timingSafeEqual } from "node:crypto";
import type { onRequestHookHandler } from "fastify";
import { AppError } from "./errors.ts";

export const PROXY_SECRET_HEADER = "x-proxy-secret";

/** Cloud Run probes this path itself, without going through the Worker. */
const OPEN_PATHS = new Set(["/health"]);

function digest(value: string): Buffer {
  return createHash("sha256").update(value).digest();
}

/**
 * In production the API sits behind the website's Worker, which adds this secret. A
 * request without it reached the API's address directly and could carry a forged
 * X-Forwarded-For, dodging the sign-in limits, so it is refused.
 */
export function requireProxySecret(secret: string): onRequestHookHandler {
  const expected = digest(secret);
  return (request, _reply, done) => {
    const sent = request.headers[PROXY_SECRET_HEADER];
    const path = request.url.split("?")[0] ?? "";
    // Digests have equal length, so the comparison takes the same time for any guess.
    if (
      OPEN_PATHS.has(path) ||
      (typeof sent === "string" && timingSafeEqual(digest(sent), expected))
    ) {
      done();
      return;
    }
    done(new AppError("FORBIDDEN", "Requests must come through the website"));
  };
}
