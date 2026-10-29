import type { LightMyRequestResponse } from "fastify";
import { describe, expect, it } from "vitest";
import { errorOf, OWNER, useTestApp } from "../../../test/app.ts";
import type { BrowserSession } from "./auth.schema.ts";
import { createOwner, LOGIN_FAILURE_LIMIT, resetOwnerPassword } from "./auth.service.ts";
import { REFRESH_COOKIE } from "./refresh-cookie.ts";

const t = useTestApp();

function login(body: { username: string; password: string }, remoteAddress = "10.0.0.1") {
  return t.request({ method: "POST", url: "/auth/login", body, auth: false, remoteAddress });
}

interface LoggedIn {
  accessToken: string;
  refreshToken: string;
}

function refreshCookieOf(response: LightMyRequestResponse) {
  return response.cookies.find((cookie) => cookie.name === REFRESH_COOKIE);
}

/** The access token from the body and the refresh token from the cookie. */
function loggedIn(response: LightMyRequestResponse): LoggedIn {
  const cookie = refreshCookieOf(response);
  if (!cookie) throw new Error(`no ${REFRESH_COOKIE} cookie in a ${String(response.statusCode)}`);
  return { accessToken: response.json<BrowserSession>().accessToken, refreshToken: cookie.value };
}

async function loginOk(): Promise<LoggedIn> {
  const response = await login(OWNER);
  expect(response.statusCode).toBe(200);
  return loggedIn(response);
}

function withCookie(refreshToken: string) {
  return { cookie: `${REFRESH_COOKIE}=${refreshToken}` };
}

function me(accessToken: string) {
  return t.request({
    method: "GET",
    url: "/auth/me",
    auth: false,
    headers: { authorization: `Bearer ${accessToken}` },
  });
}

function refresh(refreshToken: string) {
  return t.request({
    method: "POST",
    url: "/auth/refresh",
    auth: false,
    headers: withCookie(refreshToken),
  });
}

function logout(headers: Record<string, string> = {}) {
  return t.request({ method: "POST", url: "/auth/logout", auth: false, headers });
}

describe("POST /auth/login", () => {
  it("returns a session whose access token opens protected routes", async () => {
    const response = await login(OWNER);

    expect(response.json()).toEqual({
      accessToken: expect.any(String) as string,
      accessTokenExpiresAt: "2026-10-28T06:45:00.000Z",
    });
    const whoAmI = await me(loggedIn(response).accessToken);
    expect(whoAmI.statusCode).toBe(200);
    expect(whoAmI.json()).toEqual({ id: t.ownerId, username: OWNER.username });
  });

  it("ignores case and surrounding spaces in the username", async () => {
    expect((await login({ ...OWNER, username: "  OWNER " })).statusCode).toBe(200);
  });

  it("gives the same answer for a wrong password and an unknown user", async () => {
    const wrongPassword = await login({ ...OWNER, password: "not-the-password" });
    const unknownUser = await login({ username: "nobody", password: OWNER.password });

    expect(wrongPassword.statusCode).toBe(401);
    expect(unknownUser.statusCode).toBe(401);
    expect(errorOf(wrongPassword).message).toBe(errorOf(unknownUser).message);
  });

  it("locks an IP out after 5 failures in 15 minutes, even with the right password", async () => {
    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      expect((await login({ ...OWNER, password: "wrong-password" })).statusCode).toBe(401);
    }

    expect((await login(OWNER)).statusCode).toBe(429);
    expect((await login(OWNER, "10.0.0.2")).statusCode).toBe(200);

    t.setNow(new Date(t.now.getTime() + 15 * 60_000 + 1000));
    expect((await login(OWNER)).statusCode).toBe(200);
  });

  it("lets only 5 of a burst of parallel wrong logins through", async () => {
    const results = await Promise.all(
      Array.from({ length: 8 }, () => login({ ...OWNER, password: "wrong-password" })),
    );

    const statuses = results.map((response) => response.statusCode).sort();
    expect(statuses).toEqual([401, 401, 401, 401, 401, 429, 429, 429]);
  });

  it("rejects an empty body with 400", async () => {
    const response = await t.request({ method: "POST", url: "/auth/login", body: {}, auth: false });
    expect(response.statusCode).toBe(400);
  });
});

describe("login limit behind Cloud Run's proxy", () => {
  const proxied = useTestApp({ trustProxyHops: 1 });

  const loginVia = (forwardedFor: string, password: string) =>
    proxied.request({
      method: "POST",
      url: "/auth/login",
      body: { ...OWNER, password },
      auth: false,
      remoteAddress: "35.191.0.1",
      headers: { "x-forwarded-for": forwardedFor },
    });

  it("counts the address the proxy saw, not one the client wrote", async () => {
    for (let attempt = 0; attempt < LOGIN_FAILURE_LIMIT; attempt += 1) {
      const spoofed = `1.2.3.${String(attempt)}, 49.36.10.7`;
      expect((await loginVia(spoofed, "wrong-password")).statusCode).toBe(401);
    }

    expect((await loginVia("9.9.9.9, 49.36.10.7", OWNER.password)).statusCode).toBe(429);
    expect((await loginVia("49.36.10.8", OWNER.password)).statusCode).toBe(200);
  });
});

describe("access tokens on protected routes", () => {
  it("expire after 15 minutes", async () => {
    const session = await loginOk();

    t.setNow(new Date(t.now.getTime() + 15 * 60_000 + 1000));

    expect((await me(session.accessToken)).statusCode).toBe(401);
  });

  it.each([
    ["no header", undefined],
    ["wrong scheme", "Token abc"],
    ["empty bearer", "Bearer "],
    ["garbage", "Bearer not.a.jwt"],
  ])("rejects %s", async (_label, authorization) => {
    const response = await t.request({
      method: "GET",
      url: "/auth/me",
      auth: false,
      headers: authorization === undefined ? {} : { authorization },
    });
    expect(response.statusCode).toBe(401);
  });

  it("rejects a token whose signature was altered", async () => {
    const session = await loginOk();
    const tampered = `${session.accessToken.slice(0, -2)}xx`;

    expect((await me(tampered)).statusCode).toBe(401);
  });
});

describe("refresh token cookie", () => {
  it("keeps the refresh token out of page scripts and away from other sites", async () => {
    const response = await login(OWNER);

    expect(refreshCookieOf(response)).toMatchObject({
      httpOnly: true,
      sameSite: "Strict",
      path: "/",
      expires: new Date("2026-11-27T06:30:00.000Z"),
    });
    expect(refreshCookieOf(response)?.secure).toBeUndefined();
  });

  it("rotates the cookie on every refresh", async () => {
    const first = await loginOk();

    const response = await refresh(first.refreshToken);

    expect(response.json()).not.toHaveProperty("refreshToken");
    expect(loggedIn(response).refreshToken).not.toBe(first.refreshToken);
  });

  it("answers 401 when the cookie is missing", async () => {
    const response = await t.request({ method: "POST", url: "/auth/refresh", auth: false });

    expect(response.statusCode).toBe(401);
    expect(errorOf(response).message).toContain("log in again");
  });
});

describe("refresh token cookie over HTTPS", () => {
  const secure = useTestApp({ secureCookies: true });

  const SECURE_NAME = "__Host-refresh_token";

  it("is Secure and __Host- prefixed, so only this exact site over HTTPS can set it", async () => {
    const response = await secure.request({
      method: "POST",
      url: "/auth/login",
      body: OWNER,
      auth: false,
    });

    const cookie = response.cookies.find((candidate) => candidate.name === SECURE_NAME);
    expect(cookie).toMatchObject({ secure: true, path: "/", httpOnly: true, sameSite: "Strict" });
    expect(cookie?.domain).toBeUndefined();
  });

  it("refreshes and signs out with the prefixed cookie", async () => {
    const login = await secure.request({
      method: "POST",
      url: "/auth/login",
      body: OWNER,
      auth: false,
    });
    const token = login.cookies.find((candidate) => candidate.name === SECURE_NAME)?.value ?? "";
    const headers = { cookie: `${SECURE_NAME}=${token}` };

    const refreshed = await secure.request({
      method: "POST",
      url: "/auth/refresh",
      auth: false,
      headers,
    });
    const rotated =
      refreshed.cookies.find((candidate) => candidate.name === SECURE_NAME)?.value ?? "";
    const loggedOut = await secure.request({
      method: "POST",
      url: "/auth/logout",
      auth: false,
      headers: { cookie: `${SECURE_NAME}=${rotated}` },
    });

    expect(refreshed.statusCode).toBe(200);
    expect(loggedOut.cookies.find((candidate) => candidate.name === SECURE_NAME)?.maxAge).toBe(0);
  });
});

describe("POST /auth/refresh", () => {
  it("swaps a refresh token for a new session", async () => {
    const first = await loginOk();

    const response = await refresh(first.refreshToken);

    expect(response.statusCode).toBe(200);
    const second = loggedIn(response);
    expect(second.refreshToken).not.toBe(first.refreshToken);
    expect((await me(second.accessToken)).statusCode).toBe(200);
  });

  it("treats reuse of a used refresh token as theft and signs that login out", async () => {
    const first = await loginOk();
    const second = loggedIn(await refresh(first.refreshToken));

    expect((await refresh(first.refreshToken)).statusCode).toBe(401);
    expect((await refresh(second.refreshToken)).statusCode).toBe(401);
  });

  it("does not sign out other logins when one is revoked", async () => {
    const phone = await loginOk();
    const laptop = await loginOk();
    await refresh(phone.refreshToken);
    await refresh(phone.refreshToken);

    expect((await refresh(laptop.refreshToken)).statusCode).toBe(200);
  });

  it("rejects a refresh token after 30 days", async () => {
    const session = await loginOk();

    t.setNow(new Date(t.now.getTime() + 30 * 86_400_000 + 1000));

    expect((await refresh(session.refreshToken)).statusCode).toBe(401);
  });

  it("rejects an unknown refresh token", async () => {
    expect((await refresh("made-up-token")).statusCode).toBe(401);
  });

  it("signs the login out when the same refresh token is used twice at once", async () => {
    const session = await loginOk();

    const results = await Promise.all([
      refresh(session.refreshToken),
      refresh(session.refreshToken),
    ]);

    expect(results.map((response) => response.statusCode).sort()).toEqual([200, 401]);
    const winner = results.find((response) => response.statusCode === 200);
    const winnerToken = winner ? loggedIn(winner).refreshToken : "";
    expect((await refresh(winnerToken)).statusCode).toBe(401);
  });

  it("cannot keep a session alive by refreshing during a password change", async () => {
    const session = await loginOk();

    const [refreshed] = await Promise.all([
      refresh(session.refreshToken),
      t.post("/auth/change-password", {
        currentPassword: OWNER.password,
        newPassword: "a-brand-new-password",
      }),
    ]);

    const survivor = refreshed.statusCode === 200 ? loggedIn(refreshed).refreshToken : null;
    if (survivor) expect((await refresh(survivor)).statusCode).toBe(401);
    expect(await t.db.refreshToken.count({ where: { revokedAt: null } })).toBe(0);
  });
});

describe("POST /auth/logout", () => {
  it("revokes the session and clears the cookie", async () => {
    const session = await loginOk();

    const response = await logout(withCookie(session.refreshToken));

    expect(response.statusCode).toBe(204);
    expect(refreshCookieOf(response)).toMatchObject({ value: "", maxAge: 0, path: "/" });
    expect((await refresh(session.refreshToken)).statusCode).toBe(401);
  });

  it.each([
    ["a token that is already unknown", withCookie("never-issued")],
    ["no cookie at all", {}],
  ])("answers 204 for %s", async (_label, headers) => {
    expect((await logout(headers)).statusCode).toBe(204);
  });
});

describe("POST /auth/change-password", () => {
  const change = (currentPassword: string, newPassword: string) =>
    t.post("/auth/change-password", { currentPassword, newPassword });

  it("changes the password and signs out every session", async () => {
    const session = await loginOk();

    const changed = await change(OWNER.password, "a-brand-new-password");

    expect(changed.statusCode).toBe(204);
    expect(refreshCookieOf(changed)).toMatchObject({ value: "", maxAge: 0 });

    expect((await refresh(session.refreshToken)).statusCode).toBe(401);
    expect((await login(OWNER)).statusCode).toBe(401);
    expect((await login({ ...OWNER, password: "a-brand-new-password" })).statusCode).toBe(200);
    const audit = await t.db.auditLog.findFirstOrThrow({ where: { entity: "User" } });
    expect(JSON.stringify(audit.after)).not.toContain("a-brand-new-password");
  });

  it.each([
    ["the current password is wrong", "wrong-current-pw", "a-brand-new-password", "wrong"],
    ["the new password is too short", OWNER.password, "short", "at least 10"],
    ["the new password is unchanged", OWNER.password, OWNER.password, "must differ"],
  ])("rejects with 400 when %s", async (_label, current, next, message) => {
    const response = await change(current, next);

    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(response.json())).toContain(message);
  });

  it("answers 401, not 500, when the account behind the token is gone", async () => {
    await t.db.user.deleteMany();

    expect((await change(OWNER.password, "a-brand-new-password")).statusCode).toBe(401);
  });
});

describe("owner account setup", () => {
  it("creates the owner once and refuses a second one", async () => {
    await t.db.user.deleteMany();

    const owner = await createOwner(t.db, { username: " Amit ", password: "first-password-1" });

    expect(owner.username).toBe("amit");
    await expect(
      createOwner(t.db, { username: "other", password: "second-password-1" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("creates exactly one owner when two setups race", async () => {
    await t.db.user.deleteMany();

    const results = await Promise.allSettled([
      createOwner(t.db, { username: "first", password: "first-password-1" }),
      createOwner(t.db, { username: "second", password: "second-password-1" }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(await t.db.user.count()).toBe(1);
  });

  it.each([
    [{ username: "ab", password: "long-enough-pw" }, "username"],
    [{ username: "has space", password: "long-enough-pw" }, "username"],
    [{ username: "fine", password: "short" }, "at least 10"],
  ])("rejects invalid credentials %j", async (credentials, message) => {
    await t.db.user.deleteMany();

    await expect(createOwner(t.db, credentials)).rejects.toThrow(message);
  });

  it("resets the password and signs out existing sessions", async () => {
    const session = await loginOk();

    await resetOwnerPassword(
      t.db,
      { username: OWNER.username, password: "reset-password-1" },
      t.now,
    );

    expect((await refresh(session.refreshToken)).statusCode).toBe(401);
    expect((await login({ ...OWNER, password: "reset-password-1" })).statusCode).toBe(200);
  });

  it("fails to reset an unknown account", async () => {
    await expect(
      resetOwnerPassword(t.db, { username: "ghost", password: "reset-password-1" }, t.now),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
