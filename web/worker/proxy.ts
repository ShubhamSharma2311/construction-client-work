export interface ProxyEnv {
  /** The API's own address on Cloud Run, e.g. https://sawariya-api-xyz.a.run.app */
  API_ORIGIN: string;
  /** Shared with the API, which refuses any request that lacks it. */
  PROXY_SECRET: string;
}

export const PROXY_SECRET_HEADER = "x-proxy-secret";

/**
 * The browser calls /api/... on the website's own address, so the sign-in cookie stays
 * first-party; this turns that call into the same request to the API.
 */
export async function toApiRequest(request: Request, env: ProxyEnv): Promise<Request> {
  const url = new URL(request.url);
  const target = new URL(`${url.pathname.replace(/^\/api/, "")}${url.search}`, env.API_ORIGIN);
  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.set(PROXY_SECRET_HEADER, env.PROXY_SECRET);
  // The API counts failed sign-ins per address. Cloudflare's view of the visitor is the
  // only one trusted; whatever the visitor wrote in X-Forwarded-For is dropped.
  headers.delete("x-forwarded-for");
  const visitor = request.headers.get("cf-connecting-ip");
  if (visitor !== null) headers.set("x-forwarded-for", visitor);
  // API bodies are small JSON forms, so reading one whole is cheap and avoids streaming quirks.
  const body = request.body === null ? null : await request.arrayBuffer();
  return new Request(target, { method: request.method, headers, body });
}
