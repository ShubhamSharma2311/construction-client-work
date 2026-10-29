import type { FastifyReply, FastifyRequest } from "fastify";

export const REFRESH_COOKIE = "refresh_token";

// Over HTTPS the __Host- prefix makes the browser accept the cookie only from this exact
// host, Secure, at Path=/, so a sibling subdomain cannot plant or overwrite it. Plain-HTTP
// development cannot use the prefix, which is why the name depends on `secure`.
function cookieName(secure: boolean): string {
  return secure ? `__Host-${REFRESH_COOKIE}` : REFRESH_COOKIE;
}

// HttpOnly keeps the token away from page scripts. SameSite=Strict stops other sites from
// sending it, which is what makes a cookie-only refresh safe without a CSRF token. The app
// and API share one origin (the frontend proxies /api), so Strict never blocks the app itself.
function cookieOptions(secure: boolean) {
  return { httpOnly: true, sameSite: "strict", secure, path: "/" } as const;
}

export function readRefreshCookie(request: FastifyRequest, secure: boolean): string | undefined {
  return request.cookies[cookieName(secure)];
}

export function setRefreshCookie(
  reply: FastifyReply,
  token: string,
  expiresAt: string,
  secure: boolean,
): void {
  reply.setCookie(cookieName(secure), token, {
    ...cookieOptions(secure),
    expires: new Date(expiresAt),
  });
}

export function clearRefreshCookie(reply: FastifyReply, secure: boolean): void {
  reply.clearCookie(cookieName(secure), cookieOptions(secure));
}
