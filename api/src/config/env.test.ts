import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.ts";

const valid = {
  NODE_ENV: "development",
  PORT: "3000",
  DATABASE_URL: "file:./dev.db",
  JWT_SECRET: "x".repeat(32),
  CORS_ORIGINS: "http://localhost:5173, https://ledger.example.workers.dev",
  APP_URL: "http://localhost:5173/",
};

describe("loadEnv", () => {
  it("parses a complete environment", () => {
    expect(loadEnv(valid)).toEqual({
      ...valid,
      PORT: 3000,
      CORS_ORIGINS: ["http://localhost:5173", "https://ledger.example.workers.dev"],
      APP_URL: "http://localhost:5173",
      MAIL_FROM: "Sawariya Seth Construction Materials <onboarding@resend.dev>",
    });
  });

  it("names every missing variable", () => {
    expect(() => loadEnv({})).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL[\s\S]*JWT_SECRET/);
  });

  it("rejects a database URL that is not a SQLite file", () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: "postgresql://x@localhost/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadEnv({ ...valid, PORT: "70000" })).toThrow(/PORT/);
  });

  it("rejects a short JWT secret", () => {
    expect(() => loadEnv({ ...valid, JWT_SECRET: "short" })).toThrow(/at least 32 characters/);
  });

  it("rejects a CORS origin that is not a URL", () => {
    expect(() => loadEnv({ ...valid, CORS_ORIGINS: "http://ok.dev,not a url" })).toThrow(
      /CORS_ORIGINS/,
    );
  });

  it("needs a Resend key in production, where emails must really go out", () => {
    const production = { ...valid, NODE_ENV: "production" };
    expect(() => loadEnv(production)).toThrow(/RESEND_API_KEY/);
    expect(loadEnv({ ...production, RESEND_API_KEY: "re_1" }).RESEND_API_KEY).toBe("re_1");
  });
});
