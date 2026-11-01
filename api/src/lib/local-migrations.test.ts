import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { localMigrations } from "./local-migrations.ts";

describe("migrations", () => {
  it("are all listed for the Worker, which cannot read the folder", () => {
    const workerList = readFileSync(join(import.meta.dirname, "../worker/migrations.ts"), "utf8");

    for (const { name } of localMigrations()) {
      expect(workerList).toContain(`name: "${name}"`);
      expect(workerList).toContain(`/migrations/${name}.sql`);
    }
  });
});
