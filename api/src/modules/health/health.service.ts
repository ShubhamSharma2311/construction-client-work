import type { FastifyBaseLogger } from "fastify";
import type { Db } from "../../lib/prisma.ts";

export type DatabaseStatus = "ok" | "unreachable";

/** Reports the database as unreachable instead of throwing, and logs why. */
export async function checkDatabase(db: Db, log: FastifyBaseLogger): Promise<DatabaseStatus> {
  try {
    await db.$queryRaw`SELECT 1`;
    return "ok";
  } catch (error) {
    log.error({ err: error }, "health check: database query failed");
    return "unreachable";
  }
}
