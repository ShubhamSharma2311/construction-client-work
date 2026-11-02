import { describe, expect, it } from "vitest";
import { loadWorkerEnv, workerMailer } from "./worker-env.ts";

const local = { APP_URL: "http://localhost:8787/", JWT_SECRET: "j".repeat(32) };
const live = {
  ...local,
  APP_URL: "https://sawariya-seth-construction-materials.example.workers.dev",
};
const EMAIL = { to: "owner@example.com", subject: "Reset", text: "Link" };

describe("loadWorkerEnv", () => {
  it("reads a local setup, where emails are only printed and cookies are not Secure", () => {
    expect(loadWorkerEnv(local)).toEqual({
      appUrl: "http://localhost:8787",
      jwtSecret: "j".repeat(32),
      resendApiKey: undefined,
      mailFrom: "Sawariya Seth Construction Materials <onboarding@resend.dev>",
      setupToken: undefined,
      live: false,
    });
  });

  it("goes live without a Resend key, so the app runs before email is set up", () => {
    expect(loadWorkerEnv(live)).toMatchObject({ live: true, resendApiKey: undefined });
    expect(loadWorkerEnv({ ...live, RESEND_API_KEY: "re_1" })).toMatchObject({ live: true });
  });

  it("names every missing or weak setting", () => {
    expect(() => loadWorkerEnv({ JWT_SECRET: "short" })).toThrow(/APP_URL[\s\S]*JWT_SECRET/);
    expect(() => loadWorkerEnv({ ...local, SETUP_TOKEN: "short" })).toThrow(/SETUP_TOKEN/);
  });
});

describe("workerMailer", () => {
  it("fails every email when live without a Resend key, naming the missing secret", async () => {
    await expect(workerMailer(loadWorkerEnv(live)).send(EMAIL)).rejects.toThrow(/RESEND_API_KEY/);
  });

  it("prints emails on a local run without a key", async () => {
    const lines: string[] = [];

    await workerMailer(loadWorkerEnv(local), (line) => lines.push(line)).send(EMAIL);

    expect(lines.join("")).toContain("To owner@example.com: Reset");
  });
});
