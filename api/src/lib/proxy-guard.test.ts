import { afterAll, describe, expect, it } from "vitest";
import { OWNER, testDeps } from "../../test/app.ts";
import { createTestPrisma } from "../../test/db.ts";
import { buildApp } from "../app.ts";

const SECRET = "s".repeat(40);
const db = createTestPrisma();
const app = buildApp({ ...testDeps(db, () => new Date()), proxySecret: SECRET });

afterAll(async () => {
  await app.close();
  await db.$disconnect();
});

describe("proxy secret", () => {
  it("refuses a request that did not come through the website's Worker", async () => {
    const direct = await app.inject({ method: "POST", url: "/auth/login", payload: OWNER });
    const wrong = await app.inject({
      method: "POST",
      url: "/auth/login",
      payload: OWNER,
      headers: { "x-proxy-secret": "t".repeat(40) },
    });

    expect(direct.statusCode).toBe(403);
    expect(wrong.statusCode).toBe(403);
    expect(direct.json()).toMatchObject({ error: { code: "FORBIDDEN" } });
  });

  it("lets a request with the secret through to the route", async () => {
    const response = await app.inject({
      method: "GET",
      url: "/settings",
      headers: { "x-proxy-secret": SECRET },
    });

    expect(response.statusCode).toBe(401);
  });

  it("keeps the health check open for Cloud Run", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
  });
});
