import type { FetchFn } from "../api/client.ts";
import type { Ok } from "../api/types.ts";

export type { Ok };

export const BASE_URL = "http://ledger.test/api";

type Handler = (request: Request) => Response | Promise<Response>;

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

export function apiError(status: number, code: string, message: string): Response {
  return json({ error: { code, message, requestId: "req-1" } }, status);
}

export interface FakeApi {
  fetch: FetchFn;
  /** Every request seen, in order, as "METHOD /path". */
  readonly calls: string[];
  /** The Authorization header each request carried, in order. */
  readonly tokens: (string | null)[];
}

/**
 * A fetch that answers from a "METHOD /path" table. A request with no handler fails the
 * test loudly instead of hanging or returning something plausible.
 */
export function fakeApi(routes: Record<string, Handler>): FakeApi {
  const calls: string[] = [];
  const tokens: (string | null)[] = [];
  const fetch: FetchFn = async (request) => {
    const path = new URL(request.url).pathname.replace(/^\/api/, "");
    const key = `${request.method} ${path}`;
    calls.push(key);
    tokens.push(request.headers.get("authorization"));
    const handler = routes[key];
    if (!handler) throw new Error(`fakeApi: no handler for ${key}`);
    return handler(request);
  };
  return { fetch, calls, tokens };
}

export const SESSION: Ok<"/auth/login", "post"> = {
  accessToken: "token-1",
  accessTokenExpiresAt: "2026-10-28T06:45:00.000Z",
};
