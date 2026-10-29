import { createApi, type Api } from "../api/client.ts";
import { createSession, type Session, type SessionDeps } from "../auth/session.ts";

export interface Services {
  session: Session;
  api: Api;
}

/** One session and one API client per app; tests build their own with a fake fetch. */
export function createServices(deps: SessionDeps): Services {
  const session = createSession(deps);
  return { session, api: createApi(deps.baseUrl, session.authFetch) };
}
