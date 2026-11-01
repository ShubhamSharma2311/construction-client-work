import { afterAll, describe, expect, it } from "vitest";
import { ALLOWED_ORIGIN, testDeps } from "../test/app.ts";
import { createTestPrisma } from "../test/db.ts";
import { buildApp, routeList } from "./app.ts";

/** The only routes reachable without logging in. Anything else must answer 401. */
const PUBLIC_ROUTES = new Set([
  "GET /health",
  "POST /auth/login",
  "POST /auth/refresh",
  "POST /auth/logout",
  "POST /auth/forgot-password",
  "POST /auth/reset-password",
]);

const db = createTestPrisma();
const deps = testDeps(db, () => new Date());
const app = buildApp(deps);
const routes = routeList(deps).map((route) => ({
  method: route.method.toUpperCase(),
  path: route.path,
}));

afterAll(async () => {
  await db.$disconnect();
});

describe("route protection", () => {
  const isPublic = (route: { method: string; path: string }) =>
    PUBLIC_ROUTES.has(`${route.method} ${route.path}`);

  it("keeps exactly the intended routes public", () => {
    expect(routes.filter(isPublic).length).toBe(PUBLIC_ROUTES.size);
    expect(routes.filter((route) => !isPublic(route)).length).toBeGreaterThan(0);
  });

  it("answers 401 on every protected route without a token", async () => {
    const failures: string[] = [];
    for (const route of routes.filter((candidate) => !isPublic(candidate))) {
      const url = route.path.replace(/:[A-Za-z]+/g, "1");
      const withBody = route.method !== "GET";
      const response = await app.request(url, {
        method: route.method,
        ...(withBody ? { body: "{}", headers: { "content-type": "application/json" } } : {}),
      });
      if (response.status !== 401)
        failures.push(`${route.method} ${route.path} -> ${String(response.status)}`);
    }
    expect(failures).toEqual([]);
  });
});

describe("CORS", () => {
  const preflight = (origin: string) =>
    app.request("/auth/me", {
      method: "OPTIONS",
      headers: {
        origin,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });

  it("allows the configured frontend origin", async () => {
    const response = await preflight(ALLOWED_ORIGIN);

    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe(ALLOWED_ORIGIN);
  });

  it("does not allow any other origin", async () => {
    const response = await preflight("https://evil.example");

    expect(response.headers.get("access-control-allow-origin")).toBeNull();
  });
});
