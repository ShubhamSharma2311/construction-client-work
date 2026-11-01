import type { MiddlewareHandler } from "hono";

/**
 * Serves one request at a time. The ledger is one SQLite database with one owner: running
 * requests in turn makes every read-check-write safe without row locks, and stops a plain
 * query from slipping into another request's open transaction.
 */
export function oneRequestAtATime(): MiddlewareHandler {
  let queue: Promise<void> = Promise.resolve();
  return async (_c, next) => {
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = queue;
    queue = previous.then(() => turn);
    await previous;
    try {
      await next();
    } finally {
      release();
    }
  };
}
