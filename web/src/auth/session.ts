import { createApi, type FetchFn, unwrap } from "../api/client.ts";
import { ApiError } from "../api/errors.ts";

/**
 * checking: asking the server whether the refresh cookie is still good.
 * unreachable: that question could not be sent (offline, or the server is down).
 * server-error: the server answered, but with a failure other than "sign in again".
 */
export type SessionStatus =
  "checking" | "signed-in" | "signed-out" | "unreachable" | "server-error";

export interface Credentials {
  username: string;
  password: string;
}

// Function properties, not methods: React calls getStatus and subscribe detached.
export interface Session {
  getStatus: () => SessionStatus;
  subscribe: (listener: () => void) => () => void;
  /** Checks the refresh cookie. Never rejects: a failure becomes a status and is logged. */
  restore: () => Promise<void>;
  signIn: (credentials: Credentials) => Promise<void>;
  signOut: () => Promise<void>;
  /** fetch for every protected call: adds the token and renews it once on a 401. */
  authFetch: FetchFn;
}

export interface SessionDeps {
  baseUrl: string;
  fetch: FetchFn;
  /** navigator.locks where the browser has it; keeps tabs from refreshing at once. */
  locks?: Pick<LockManager, "request"> | undefined;
}

// The backend treats a refresh token used twice as stolen and signs that login out, so
// refreshes must never overlap: one at a time per tab, and one at a time across tabs.
const REFRESH_LOCK = "sand-trip-ledger-refresh";

export function createSession(deps: SessionDeps): Session {
  const publicApi = createApi(deps.baseUrl, deps.fetch);
  const listeners = new Set<() => void>();
  let status: SessionStatus = "checking";
  let accessToken: string | null = null;
  let refreshing: Promise<boolean> | null = null;
  // Sign in and sign out start a new generation. A refresh that began in an older one
  // must not undo them when its answer arrives late.
  let generation = 0;

  const setState = (next: SessionStatus, token: string | null) => {
    accessToken = token;
    if (next === status) return;
    status = next;
    for (const listener of listeners) listener();
  };

  const requestRefresh = async (): Promise<boolean> => {
    const startedIn = generation;
    const result = await publicApi.POST("/auth/refresh");
    if (startedIn !== generation) return status === "signed-in";
    if (result.response.status === 401) {
      setState("signed-out", null);
      return false;
    }
    setState("signed-in", unwrap(result).accessToken);
    return true;
  };

  const refresh = (): Promise<boolean> => {
    refreshing ??= (
      deps.locks ? deps.locks.request(REFRESH_LOCK, requestRefresh) : requestRefresh()
    ).finally(() => {
      refreshing = null;
    });
    return refreshing;
  };

  const withToken = (request: Request): Request => {
    if (accessToken === null) return request;
    const headers = new Headers(request.headers);
    headers.set("Authorization", `Bearer ${accessToken}`);
    return new Request(request, { headers });
  };

  return {
    getStatus: () => status,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async restore() {
      setState("checking", accessToken);
      try {
        await refresh();
      } catch (error) {
        console.error("Could not check the saved sign in", error);
        setState(error instanceof ApiError ? "server-error" : "unreachable", null);
      }
    },
    async signIn(credentials) {
      const session = unwrap(await publicApi.POST("/auth/login", { body: credentials }));
      generation += 1;
      setState("signed-in", session.accessToken);
    },
    async signOut() {
      // Let a refresh in flight land first, so the logout revokes the newest cookie. That
      // refresh's own caller reports it if it fails; here only its timing matters.
      await refreshing?.catch(() => false);
      const result = await publicApi.POST("/auth/logout");
      if (!result.response.ok)
        throw new ApiError(result.response.status, "LOGOUT", "Sign out failed");
      generation += 1;
      setState("signed-out", null);
    },
    async authFetch(request) {
      const retry = request.clone();
      const response = await deps.fetch(withToken(request));
      if (response.status !== 401) return response;
      return (await refresh()) ? deps.fetch(withToken(retry)) : response;
    },
  };
}
