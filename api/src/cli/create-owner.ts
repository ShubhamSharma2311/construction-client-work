import { parseArgs } from "node:util";
import { loadEnv } from "../config/env.ts";
import { systemClock } from "../lib/clock.ts";
import { createPrisma } from "../lib/local-db.ts";
import { createOwner, resetOwnerPassword } from "../modules/auth/auth.service.ts";

// Usage: OWNER_PASSWORD='...' npm run create-owner -- --username amit [--reset]
// The password comes from the environment so it never lands in shell history.
const { values } = parseArgs({
  options: { username: { type: "string" }, reset: { type: "boolean", default: false } },
});
const password = process.env["OWNER_PASSWORD"];
if (!values.username || !password) {
  console.error("Usage: OWNER_PASSWORD='...' npm run create-owner -- --username <name> [--reset]");
  process.exit(1);
}

const env = loadEnv();
const db = createPrisma(env.DATABASE_URL);
try {
  const credentials = { username: values.username, password };
  const owner = values.reset
    ? await resetOwnerPassword(db, credentials, systemClock())
    : await createOwner(db, credentials);
  console.log(`${values.reset ? "Password reset for" : "Created"} owner "${owner.username}"`);
} finally {
  await db.$disconnect();
}
