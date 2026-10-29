import { describe, expect, it } from "vitest";
import { buildOpenApiSpec } from "./openapi.ts";

interface Spec {
  openapi: string;
  paths: Record<string, Record<string, OperationSpec>>;
}
interface OperationSpec {
  requestBody?: { content: Record<string, { schema: { properties?: Record<string, unknown> } }> };
  responses: Record<string, { content?: Record<string, { schema: unknown }> }>;
}

describe("OpenAPI description", () => {
  it("describes every route the frontend calls, with request and response shapes", async () => {
    const spec = (await buildOpenApiSpec()) as Spec;

    expect(spec.openapi).toMatch(/^3\./);
    expect(Object.keys(spec.paths)).toEqual(
      expect.arrayContaining(["/auth/login", "/trips", "/customers/{id}/payments", "/dashboard"]),
    );
    const createTrip = spec.paths["/trips"]?.["post"];
    expect(createTrip?.requestBody?.content["application/json"]?.schema.properties).toHaveProperty(
      "amount",
    );
  });

  it("never shows the refresh token in a response body", async () => {
    const spec = (await buildOpenApiSpec()) as Spec;

    const loginOk = spec.paths["/auth/login"]?.["post"]?.responses["200"];
    expect(JSON.stringify(loginOk)).toContain("accessToken");
    expect(JSON.stringify(loginOk)).not.toContain("refreshToken");
  });
});
