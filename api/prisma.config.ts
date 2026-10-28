import { defineConfig } from "prisma/config";

const url = process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  // `prisma generate` runs on install with no database. Migrate commands still
  // fail loudly without a URL, because Prisma requires a datasource for them.
  ...(url ? { datasource: { url } } : {}),
});
