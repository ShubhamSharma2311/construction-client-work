import { type ProxyEnv, toApiRequest } from "./proxy.ts";

interface Env extends ProxyEnv {
  ASSETS: Fetcher;
}

// Only /api/* reaches this code (run_worker_first in wrangler.jsonc); every other path is
// the built app, served straight from the assets.
export default {
  async fetch(request, env) {
    if (new URL(request.url).pathname.startsWith("/api/")) {
      return fetch(await toApiRequest(request, env));
    }
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
