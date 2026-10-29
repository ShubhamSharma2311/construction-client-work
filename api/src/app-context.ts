import type { Clock } from "./lib/clock.ts";
import type { Db } from "./lib/prisma.ts";

/** What every route module receives; services get only the parts they need. */
export interface AppContext {
  db: Db;
  clock: Clock;
  jwtSecret: string;
  /** Mark auth cookies Secure; true whenever the app is served over HTTPS. */
  secureCookies: boolean;
}
