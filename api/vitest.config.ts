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
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts", "src/modules/**/*.ts"],
      exclude: ["src/**/*.test.ts"],
      thresholds: { lines: 90 },
    },
  },
});
