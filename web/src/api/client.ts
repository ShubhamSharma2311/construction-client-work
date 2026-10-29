import createClient, { type Client } from "openapi-fetch";
import { toApiError } from "./errors.ts";
import type { paths } from "./schema.gen.ts";

export type Api = Client<paths>;
export type FetchFn = (request: Request) => Promise<Response>;

export function createApi(baseUrl: string, fetchFn: FetchFn): Api {
  return createClient<paths>({ baseUrl, fetch: fetchFn });
}

interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response: Response;
}

/** The data of a successful call; anything else throws an ApiError. */
export function unwrap<T>(result: ApiResult<T>): T {
  if (!result.response.ok) throw toApiError(result.response, result.error);
  if (result.data === undefined) {
    throw toApiError(result.response, { error: { code: "EMPTY", message: "Empty response" } });
  }
  return result.data;
}
