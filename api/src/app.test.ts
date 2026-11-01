import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { TestResponse, testDeps } from "../test/app.ts";
import { createTestPrisma } from "../test/db.ts";
import { buildApp, mountRoute } from "./app.ts";
import { AppError, ERROR_STATUS, type ErrorCode } from "./lib/errors.ts";
import { ledgerPrisma } from "./lib/prisma.ts";
import { RouteTable, respond } from "./lib/route.ts";

const db = createTestPrisma();

afterAll(async () => {
  await db.$disconnect();
});

function appWithProbeRoutes() {
  const deps = testDeps(db, () => new Date());
  const app = buildApp(deps);
  const probes = new RouteTable(false);
  probes.get("/probe/app-error/:code", { params: z.object({ code: z.string() }) }, (request) => {
    const code = request.params.code as ErrorCode;
    throw new AppError(code, `probe ${code}`, { field: "x" });
  });
  probes.get("/probe/crash", {}, () => {
    throw new Error("database password is hunter2");
  });
  probes.post("/probe/validate", { body: z.object({ amount: z.number().positive() }) }, (request) =>
    respond(200, request.body),
  );
  for (const route of probes.routes) mountRoute(app, route, deps);
  return async (path: string, init?: RequestInit) =>
    TestResponse.from(await app.request(path, init));
}

describe("error mapping", () => {
  const call = appWithProbeRoutes();

  it.each(Object.entries(ERROR_STATUS))("maps AppError %s to HTTP %d", async (code, status) => {
    const response = await call(`/probe/app-error/${code}`);

    expect(response.statusCode).toBe(status);
    expect(response.json()).toEqual({
      error: {
        code,
        message: `probe ${code}`,
        details: { field: "x" },
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("returns 400 with the failing field for a schema violation", async () => {
    const response = await call("/probe/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: -5 }),
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{
      error: { code: string; details: { issues: { path: string }[] } };
    }>();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details.issues[0]?.path).toBe("body/amount");
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await call("/probe/validate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{not json",
    });

    expect(response.statusCode).toBe(400);
  });

  it("returns 415 for a body that is not JSON", async () => {
    const response = await call("/probe/validate", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "amount=5",
    });

    expect(response.statusCode).toBe(415);
  });

  it("hides internal error text behind a 500 with a request id", async () => {
    const response = await call("/probe/crash");

    expect(response.statusCode).toBe(500);
    expect(response.body).not.toContain("hunter2");
    expect(response.json()).toEqual({
      error: {
        code: "INTERNAL",
        message: "Something went wrong",
        requestId: response.headers["x-request-id"],
      },
    });
  });

  it("returns 404 in the same error shape for an unknown route", async () => {
    const response = await call("/nope");

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("gives every response its own request id and ignores one sent by the client", async () => {
    const first = await call("/nope", { headers: { "x-request-id": "spoofed" } });
    const second = await call("/nope");

    expect(first.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
  });
});

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const app = buildApp(testDeps(db, () => new Date()));

    const response = await app.request("/health");

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", database: "ok" });
  });

  it("reports 503 when the database is unreachable", async () => {
    const deadDb = ledgerPrisma({
      sql: {
        exec() {
          throw new Error("storage unavailable");
        },
      },
      transaction: () => Promise.reject(new Error("storage unavailable")),
    });
    const app = buildApp(testDeps(deadDb, () => new Date()));

    const response = await app.request("/health");

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable", database: "unreachable" });
    await deadDb.$disconnect();
  });
});
