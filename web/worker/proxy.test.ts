import { describe, expect, it } from "vitest";
import { toApiRequest } from "./proxy.ts";

const ENV = { API_ORIGIN: "https://api.example.run.app", PROXY_SECRET: "s".repeat(40) };

describe("toApiRequest", () => {
  it("drops the /api prefix and keeps the query, method and body", async () => {
    const request = new Request("https://app.example.dev/api/trips?status=DUE", {
      method: "POST",
      body: '{"amount":"3500"}',
      headers: { "content-type": "application/json", cookie: "__Host-refresh_token=abc" },
    });

    const forwarded = await toApiRequest(request, ENV);

    expect(forwarded.url).toBe("https://api.example.run.app/trips?status=DUE");
    expect(forwarded.method).toBe("POST");
    expect(await forwarded.text()).toBe('{"amount":"3500"}');
    expect(forwarded.headers.get("cookie")).toBe("__Host-refresh_token=abc");
  });

  it("adds the shared secret, replacing any the visitor sent", async () => {
    const request = new Request("https://app.example.dev/api/settings", {
      headers: { "x-proxy-secret": "guess" },
    });

    expect((await toApiRequest(request, ENV)).headers.get("x-proxy-secret")).toBe(ENV.PROXY_SECRET);
  });

  it("passes on Cloudflare's view of the visitor's address, not the visitor's own claim", async () => {
    const request = new Request("https://app.example.dev/api/auth/login", {
      headers: { "x-forwarded-for": "1.2.3.4", "cf-connecting-ip": "203.0.113.7" },
    });

    expect((await toApiRequest(request, ENV)).headers.get("x-forwarded-for")).toBe("203.0.113.7");
  });
});
