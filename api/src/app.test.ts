import { afterAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { testDeps } from "../test/app.ts";
import { createTestPrisma } from "../test/db.ts";
import { buildApp } from "./app.ts";
import { AppError, ERROR_STATUS, type ErrorCode } from "./lib/errors.ts";
import { createPrisma } from "./lib/prisma.ts";

const db = createTestPrisma();

afterAll(async () => {
  await db.$disconnect();
});

function appWithProbeRoutes() {
  const app = buildApp(testDeps(db, () => new Date()));
  app.get<{ Params: { code: ErrorCode } }>("/probe/app-error/:code", (request) => {
    throw new AppError(request.params.code, `probe ${request.params.code}`, { field: "x" });
  });
  app.get("/probe/status-without-code", () => {
    throw Object.assign(new Error("teapot"), { statusCode: 418 });
  });
  app.get("/probe/crash", () => {
    throw new Error("database password is hunter2");
  });
  app.post(
    "/probe/validate",
    { schema: { body: z.object({ amount: z.number().positive() }) } },
    (request) => request.body,
  );
  return app;
}

describe("error mapping", () => {
  const app = appWithProbeRoutes();
  afterAll(() => app.close());

  it.each(Object.entries(ERROR_STATUS))("maps AppError %s to HTTP %d", async (code, status) => {
    const response = await app.inject({ method: "GET", url: `/probe/app-error/${code}` });

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
    const response = await app.inject({
      method: "POST",
      url: "/probe/validate",
      payload: { amount: -5 },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json<{
      error: { code: string; details: { issues: { path: string }[] } };
    }>();
    expect(body.error.code).toBe("VALIDATION");
    expect(body.error.details.issues[0]?.path).toBe("body/amount");
  });

  it("returns 400 for malformed JSON", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/probe/validate",
      headers: { "content-type": "application/json" },
      payload: "{not json",
    });

    expect(response.statusCode).toBe(400);
  });

  it("keeps the error shape for a 4xx error that carries no code", async () => {
    const response = await app.inject({ method: "GET", url: "/probe/status-without-code" });

    expect(response.statusCode).toBe(418);
    expect(response.json()).toMatchObject({ error: { code: "BAD_REQUEST", message: "teapot" } });
  });

  it("hides internal error text behind a 500 with a request id", async () => {
    const response = await app.inject({ method: "GET", url: "/probe/crash" });

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
    const response = await app.inject({ method: "GET", url: "/nope" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "NOT_FOUND" } });
  });

  it("gives every response its own request id and ignores one sent by the client", async () => {
    const first = await app.inject({
      method: "GET",
      url: "/nope",
      headers: { "x-request-id": "spoofed" },
    });
    const second = await app.inject({ method: "GET", url: "/nope" });

    expect(first.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.headers["x-request-id"]).not.toBe(second.headers["x-request-id"]);
  });
});

describe("GET /health", () => {
  it("reports ok when the database answers", async () => {
    const app = buildApp(testDeps(db, () => new Date()));

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", database: "ok" });
    await app.close();
  });

  it("reports 503 when the database is unreachable", async () => {
    const deadDb = createPrisma("postgresql://ledger:ledger@127.0.0.1:1/none");
    const app = buildApp(testDeps(deadDb, () => new Date()));

    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: "unavailable", database: "unreachable" });
    await app.close();
    await deadDb.$disconnect();
  });
});
