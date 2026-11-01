import { defineConfig } from "prisma/config";

const url = process.env["DATABASE_URL"];

export default defineConfig({
  schema: "prisma/schema.prisma",
  // The schema's SQL lives in migrations/ (applied by src/lib/migrate.ts), not Prisma Migrate.
  // `prisma migrate diff`, which writes that SQL, still needs a URL for the SQLite dialect.
  ...(url ? { datasource: { url } } : {}),
});
