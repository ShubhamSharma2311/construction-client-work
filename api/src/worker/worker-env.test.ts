import { describe, expect, it } from "vitest";
import { loadWorkerEnv } from "./worker-env.ts";

const local = { APP_URL: "http://localhost:8787/", JWT_SECRET: "j".repeat(32) };

describe("loadWorkerEnv", () => {
  it("reads a local setup, where emails are only printed and cookies are not Secure", () => {
    expect(loadWorkerEnv(local)).toEqual({
      appUrl: "http://localhost:8787",
      jwtSecret: "j".repeat(32),
      resendApiKey: undefined,
      mailFrom: "Sawariya Seth <onboarding@resend.dev>",
      setupToken: undefined,
      live: false,
    });
  });

  it("needs a Resend key once the app is live on https", () => {
    const live = { ...local, APP_URL: "https://sawariya-seth.example.workers.dev" };

    expect(() => loadWorkerEnv(live)).toThrow(/RESEND_API_KEY/);
    expect(loadWorkerEnv({ ...live, RESEND_API_KEY: "re_1" })).toMatchObject({ live: true });
  });

  it("names every missing or weak setting", () => {
    expect(() => loadWorkerEnv({ JWT_SECRET: "short" })).toThrow(/APP_URL[\s\S]*JWT_SECRET/);
    expect(() => loadWorkerEnv({ ...local, SETUP_TOKEN: "short" })).toThrow(/SETUP_TOKEN/);
  });
});
