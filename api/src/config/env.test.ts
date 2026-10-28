import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.ts";

const valid = {
  NODE_ENV: "development",
  PORT: "3000",
  DATABASE_URL: "postgresql://bajri:bajri@localhost:5432/bajri_hisab",
};

describe("loadEnv", () => {
  it("parses a complete environment and defaults the log level", () => {
    expect(loadEnv(valid)).toEqual({ ...valid, PORT: 3000, LOG_LEVEL: "info" });
  });

  it("names every missing variable", () => {
    expect(() => loadEnv({})).toThrow(/NODE_ENV[\s\S]*PORT[\s\S]*DATABASE_URL/);
  });

  it("rejects a non-postgres database URL", () => {
    expect(() => loadEnv({ ...valid, DATABASE_URL: "mysql://x@localhost/db" })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects an out-of-range port", () => {
    expect(() => loadEnv({ ...valid, PORT: "70000" })).toThrow(/PORT/);
  });
});
