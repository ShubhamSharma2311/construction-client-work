import type { RouteOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ALLOWED_ORIGIN, testDeps } from "../test/app.ts";
import { createTestPrisma } from "../test/db.ts";
import { buildApp, type App } from "./app.ts";

/** The only routes reachable without logging in. Anything else must answer 401. */
const PUBLIC_ROUTES = new Set([
  "GET /health",
  "HEAD /health",
  "POST /auth/login",
  "POST /auth/refresh",
  "POST /auth/logout",
  "OPTIONS *",
]);

const db = createTestPrisma();
const routes: Pick<RouteOptions, "method" | "url">[] = [];
let app: App;

beforeAll(async () => {
  app = buildApp(testDeps(db, () => new Date()));
  app.addHook("onRoute", (route) => {
    routes.push({ method: route.method, url: route.url });
  });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

function protectedRoutes(): { method: string; url: string }[] {
  return routes
    .flatMap((route) =>
      (Array.isArray(route.method) ? route.method : [route.method]).map((method) => ({
        method,
        url: route.url,
      })),
    )
    .filter((route) => !PUBLIC_ROUTES.has(`${route.method} ${route.url}`));
}

describe("route protection", () => {
  it("finds the protected routes", () => {
    expect(protectedRoutes().length).toBeGreaterThan(0);
  });

  it("answers 401 on every protected route without a token", async () => {
    const failures: string[] = [];
    for (const route of protectedRoutes()) {
      const url = route.url.replace(/:[A-Za-z]+/g, "1");
      const response = await app.inject({
        method: route.method as "GET",
        url,
        payload: route.method === "GET" || route.method === "HEAD" ? undefined : {},
      });
      if (response.statusCode !== 401)
        failures.push(`${route.method} ${route.url} -> ${response.statusCode}`);
    }
    expect(failures).toEqual([]);
  });
});

describe("CORS", () => {
  const preflight = (origin: string) =>
    app.inject({
      method: "OPTIONS",
      url: "/auth/me",
      headers: {
        origin,
        "access-control-request-method": "GET",
        "access-control-request-headers": "authorization",
      },
    });

  it("allows the configured frontend origin", async () => {
    const response = await preflight(ALLOWED_ORIGIN);

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-origin"]).toBe(ALLOWED_ORIGIN);
  });

  it("does not allow any other origin", async () => {
    const response = await preflight("https://evil.example");

    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
