import { parseEnv } from "node:util";
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";

const testEnv = parseEnv(readFileSync(".env.test", "utf8"));

export default defineConfig({
  test: {
    env: testEnv,
    globalSetup: ["test/global-setup.ts"],
    // Every DB test truncates the same database, so test files must not run in parallel.
    fileParallelism: false,
    // One reused worker: a fresh process per file adds startup cost and stalled runs on a
    // loaded machine. Each file builds its own app and DB client, so nothing leaks.
    isolate: false,
    maxWorkers: 1,
    // DB-backed tests do dozens of requests each; the first one in a run starts cold.
    testTimeout: 20_000,
    hookTimeout: 20_000,
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/modules/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: { lines: 90 },
    },
  },
});
