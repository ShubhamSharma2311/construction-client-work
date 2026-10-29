import { describe, expect, it } from "vitest";
import { BASE_URL, fakeApi, json, SESSION } from "../test/fake-api.ts";
import { createServices } from "./services.ts";

describe("services", () => {
  it("gives the API client the session's token", async () => {
    const api = fakeApi({
      "POST /auth/refresh": () => json(SESSION),
      "GET /settings": () => json(null),
    });
    const services = createServices({ baseUrl: BASE_URL, fetch: api.fetch });

    await services.session.restore();
    await services.api.GET("/settings");

    expect(api.tokens.at(-1)).toBe(`Bearer ${SESSION.accessToken}`);
  });
});
