import type { FastifyInstance } from "fastify";

/**
 * Serves one request at a time. The ledger is one SQLite database with one owner: running
 * requests in turn makes every read-check-write safe without row locks, and stops a plain
 * query from slipping into another request's open transaction on the shared connection.
 */
export function oneRequestAtATime(app: FastifyInstance): void {
  let queue: Promise<void> = Promise.resolve();
  const releases = new WeakMap<object, () => void>();

  app.addHook("onRequest", async (request) => {
    let release!: () => void;
    const turn = new Promise<void>((resolve) => {
      release = resolve;
    });
    const previous = queue;
    queue = previous.then(() => turn);
    releases.set(request, release);
    await previous;
  });
  // onResponse runs for every request that got a reply, errors included.
  app.addHook("onResponse", (request, _reply, done) => {
    releases.get(request)?.();
    done();
  });
  // A request whose client went away gets no reply; it must still give up its turn.
  app.addHook("onRequestAbort", (request, done) => {
    releases.get(request)?.();
    done();
  });
}
