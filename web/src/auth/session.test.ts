import { describe, expect, it, vi } from "vitest";
import { ApiError } from "../api/errors.ts";
import { apiError, BASE_URL, fakeApi, json, SESSION } from "../test/fake-api.ts";
import { createSession } from "./session.ts";

const signedIn = (token: string) => json({ ...SESSION, accessToken: token });
const meRequest = () => new Request(`${BASE_URL}/auth/me`);

describe("session", () => {
  it("starts out checking and becomes signed in when the refresh cookie is good", async () => {
    const api = fakeApi({ "POST /auth/refresh": () => signedIn("restored") });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });
    const changed = vi.fn();
    session.subscribe(changed);

    expect(session.getStatus()).toBe("checking");
    await session.restore();

    expect(session.getStatus()).toBe("signed-in");
    expect(changed).toHaveBeenCalledTimes(1);
  });

  it("is signed out when there is no valid refresh cookie", async () => {
    const api = fakeApi({ "POST /auth/refresh": () => apiError(401, "UNAUTHORIZED", "log in") });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });

    await session.restore();

    expect(session.getStatus()).toBe("signed-out");
  });

  it.each([
    ["unreachable", () => Promise.reject(new TypeError("Failed to fetch"))],
    ["server-error", () => Promise.resolve(apiError(503, "UNAVAILABLE", "database down"))],
  ] as const)("is %s, and logs the cause, when the check fails", async (expected, fetch) => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const session = createSession({ baseUrl: BASE_URL, fetch });

    await session.restore();

    expect(session.getStatus()).toBe(expected);
    expect(logged).toHaveBeenCalledWith("Could not check the saved sign in", expect.anything());
    logged.mockRestore();
  });

  it("signs in and sends the access token on protected calls", async () => {
    const api = fakeApi({
      "POST /auth/login": () => signedIn("from-login"),
      "GET /auth/me": () => json({ id: 1, username: "owner" }),
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });

    await session.signIn({ username: "owner", password: "pw" });
    await session.authFetch(meRequest());

    expect(session.getStatus()).toBe("signed-in");
    expect(api.tokens.at(-1)).toBe("Bearer from-login");
  });

  it("keeps the server's code and message when sign in is refused", async () => {
    const api = fakeApi({
      "POST /auth/login": () => apiError(429, "RATE_LIMITED", "Too many failed logins"),
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });

    const failure = session.signIn({ username: "owner", password: "pw" });

    await expect(failure).rejects.toBeInstanceOf(ApiError);
    await expect(failure).rejects.toMatchObject({ status: 429, code: "RATE_LIMITED" });
    expect(session.getStatus()).toBe("checking");
  });

  it("renews an expired access token once and repeats the call", async () => {
    let meCalls = 0;
    const api = fakeApi({
      "POST /auth/login": () => signedIn("old"),
      "POST /auth/refresh": () => signedIn("new"),
      "GET /auth/me": () => {
        meCalls += 1;
        return meCalls === 1 ? apiError(401, "UNAUTHORIZED", "expired") : json({ id: 1 });
      },
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });
    await session.signIn({ username: "owner", password: "pw" });

    const response = await session.authFetch(meRequest());

    expect(response.status).toBe(200);
    expect(api.calls).toEqual([
      "POST /auth/login",
      "GET /auth/me",
      "POST /auth/refresh",
      "GET /auth/me",
    ]);
    expect(api.tokens.at(-1)).toBe("Bearer new");
  });

  it("sends one refresh for many calls that expire together", async () => {
    let refreshes = 0;
    const api = fakeApi({
      "POST /auth/login": () => signedIn("old"),
      "POST /auth/refresh": () => {
        refreshes += 1;
        return signedIn("new");
      },
      "GET /auth/me": (request) =>
        request.headers.get("authorization") === "Bearer new"
          ? json({ id: 1 })
          : apiError(401, "UNAUTHORIZED", "expired"),
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });
    await session.signIn({ username: "owner", password: "pw" });

    const responses = await Promise.all([1, 2, 3].map(() => session.authFetch(meRequest())));

    expect(responses.map((response) => response.status)).toEqual([200, 200, 200]);
    expect(refreshes).toBe(1);
  });

  it("holds the cross-tab lock while refreshing", async () => {
    const api = fakeApi({ "POST /auth/refresh": () => signedIn("new") });
    const held: string[] = [];
    const locks = {
      request: ((name: string, callback: () => Promise<boolean>) => {
        held.push(name);
        return callback();
      }) as LockManager["request"],
    };
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch, locks });

    await session.restore();

    expect(held).toEqual(["sand-trip-ledger-refresh"]);
  });

  it("signs out when the refresh is refused, and returns the original 401", async () => {
    const api = fakeApi({
      "POST /auth/login": () => signedIn("old"),
      "POST /auth/refresh": () => apiError(401, "UNAUTHORIZED", "log in again"),
      "GET /auth/me": () => apiError(401, "UNAUTHORIZED", "expired"),
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });
    await session.signIn({ username: "owner", password: "pw" });

    const response = await session.authFetch(meRequest());

    expect(response.status).toBe(401);
    expect(session.getStatus()).toBe("signed-out");
    expect(api.calls.filter((call) => call === "GET /auth/me")).toHaveLength(1);
  });

  it("passes other failures through untouched", async () => {
    const api = fakeApi({ "GET /auth/me": () => apiError(409, "CONFLICT", "no") });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });

    expect((await session.authFetch(meRequest())).status).toBe(409);
    expect(api.calls).toEqual(["GET /auth/me"]);
  });

  it("signs out on the server and forgets the token", async () => {
    const api = fakeApi({
      "POST /auth/login": () => signedIn("tok"),
      "POST /auth/logout": () => new Response(null, { status: 204 }),
      "GET /auth/me": () => apiError(401, "UNAUTHORIZED", "no token"),
      "POST /auth/refresh": () => apiError(401, "UNAUTHORIZED", "log in again"),
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });
    await session.signIn({ username: "owner", password: "pw" });

    await session.signOut();
    await session.authFetch(meRequest());

    expect(session.getStatus()).toBe("signed-out");
    expect(api.tokens.at(-2)).toBeNull();
  });

  it("fails loud when the server refuses to sign out", async () => {
    const api = fakeApi({ "POST /auth/logout": () => apiError(500, "INTERNAL", "boom") });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });

    await expect(session.signOut()).rejects.toThrow("Sign out failed");
  });
});

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((settle) => {
    resolve = settle;
  });
  return { promise, resolve };
}

describe("session races", () => {
  it("keeps a sign in that finished while an older refresh was still on its way", async () => {
    const slowRefresh = deferred<Response>();
    const api = fakeApi({
      "POST /auth/refresh": () => slowRefresh.promise,
      "POST /auth/login": () => signedIn("from-login"),
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });

    const restoring = session.restore();
    await session.signIn({ username: "owner", password: "pw" });
    slowRefresh.resolve(apiError(401, "UNAUTHORIZED", "no cookie"));
    await restoring;

    expect(session.getStatus()).toBe("signed-in");
  });

  it("stays signed out when a refresh started before sign out comes back late", async () => {
    const slowRefresh = deferred<Response>();
    const api = fakeApi({
      "POST /auth/login": () => signedIn("old"),
      "POST /auth/refresh": () => slowRefresh.promise,
      "POST /auth/logout": () => new Response(null, { status: 204 }),
      "GET /auth/me": () => apiError(401, "UNAUTHORIZED", "expired"),
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });
    await session.signIn({ username: "owner", password: "pw" });

    const call = session.authFetch(meRequest());
    await vi.waitFor(() => {
      expect(api.calls).toContain("POST /auth/refresh");
    });
    const signingOut = session.signOut();
    slowRefresh.resolve(signedIn("revived"));
    await Promise.all([call, signingOut]);

    expect(session.getStatus()).toBe("signed-out");
    expect(api.calls.at(-1)).toBe("POST /auth/logout");
  });

  it("repeats a save with its body and idempotency key intact after renewing", async () => {
    const seen: { body: string; key: string | null }[] = [];
    const api = fakeApi({
      "POST /auth/login": () => signedIn("old"),
      "POST /auth/refresh": () => signedIn("new"),
      "POST /trips": async (request) => {
        seen.push({ body: await request.text(), key: request.headers.get("idempotency-key") });
        return seen.length === 1 ? apiError(401, "UNAUTHORIZED", "expired") : json({ id: 1 }, 201);
      },
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });
    await session.signIn({ username: "owner", password: "pw" });

    const response = await session.authFetch(
      new Request(`${BASE_URL}/trips`, {
        method: "POST",
        body: JSON.stringify({ amount: "3500" }),
        headers: { "content-type": "application/json", "idempotency-key": "k-1" },
      }),
    );

    expect(response.status).toBe(201);
    expect(seen).toEqual([
      { body: '{"amount":"3500"}', key: "k-1" },
      { body: '{"amount":"3500"}', key: "k-1" },
    ]);
  });

  it("fails the call loudly when the renewal itself cannot reach the server", async () => {
    const api = fakeApi({
      "POST /auth/login": () => signedIn("old"),
      "POST /auth/refresh": () => Promise.reject(new TypeError("Failed to fetch")),
      "GET /auth/me": () => apiError(401, "UNAUTHORIZED", "expired"),
    });
    const session = createSession({ baseUrl: BASE_URL, fetch: api.fetch });
    await session.signIn({ username: "owner", password: "pw" });

    await expect(session.authFetch(meRequest())).rejects.toThrow("Failed to fetch");
  });
});
