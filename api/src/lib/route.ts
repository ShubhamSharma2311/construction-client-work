import type { Context } from "hono";
import type { z } from "zod";
import type { AppContext } from "../app-context.ts";
import { AppError } from "./errors.ts";

export type Method = "get" | "post" | "put" | "patch" | "delete";

export interface RouteSchemas {
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  /** Reply schemas by status. A reply is parsed through its schema, which drops unlisted fields. */
  response?: Partial<Record<number, z.ZodType>>;
}

type Parsed<T> = T extends z.ZodType ? z.output<T> : undefined;

export interface RouteRequest<S extends RouteSchemas> {
  readonly params: Parsed<S["params"]>;
  readonly query: Parsed<S["query"]>;
  readonly body: Parsed<S["body"]>;
  readonly headers: Headers;
  /** The signed-in owner on a private route; 0 on a public one. */
  readonly userId: number;
  /** The visitor's address as Cloudflare (or the local server) saw it. */
  readonly ip: string;
  /** For cookies; most handlers never need it. */
  readonly context: Context;
}

const REPLY = Symbol("reply");

/** A reply with its own status or headers; a handler returning a plain value replies 200. */
export interface Reply {
  readonly [REPLY]: true;
  readonly status: number;
  readonly body: unknown;
  readonly headers: Readonly<Record<string, string>>;
}

export function respond(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Reply {
  return { [REPLY]: true, status, body, headers };
}

type PlainBody<S extends RouteSchemas> = S["response"] extends { 200: infer R extends z.ZodType }
  ? z.input<R>
  : never;

/** A plain value (the 200 body), a Reply, or a ready Response such as a CSV download. */
export type HandlerResult<S extends RouteSchemas> = PlainBody<S> | Reply | Response;

export type Handler<S extends RouteSchemas> = (
  request: RouteRequest<S>,
) => HandlerResult<S> | Promise<HandlerResult<S>>;

export interface RouteDef {
  readonly method: Method;
  /** Hono path syntax, e.g. "/trips/:id". */
  readonly path: string;
  readonly schemas: RouteSchemas;
  readonly requiresAuth: boolean;
  readonly handler: Handler<RouteSchemas>;
}

/** Collects one module's routes; the app mounts them and describes them in its API document. */
export class RouteTable {
  readonly routes: RouteDef[] = [];

  constructor(private readonly requiresAuth: boolean) {}

  get<S extends RouteSchemas>(path: string, schemas: S, handler: Handler<S>): void {
    this.add("get", path, schemas, handler);
  }

  post<S extends RouteSchemas>(path: string, schemas: S, handler: Handler<S>): void {
    this.add("post", path, schemas, handler);
  }

  put<S extends RouteSchemas>(path: string, schemas: S, handler: Handler<S>): void {
    this.add("put", path, schemas, handler);
  }

  patch<S extends RouteSchemas>(path: string, schemas: S, handler: Handler<S>): void {
    this.add("patch", path, schemas, handler);
  }

  delete<S extends RouteSchemas>(path: string, schemas: S, handler: Handler<S>): void {
    this.add("delete", path, schemas, handler);
  }

  private add<S extends RouteSchemas>(
    method: Method,
    path: string,
    schemas: S,
    handler: Handler<S>,
  ) {
    // The handler only ever receives a request built from these same schemas.
    const general = handler as unknown as Handler<RouteSchemas>;
    this.routes.push({ method, path, schemas, requiresAuth: this.requiresAuth, handler: general });
  }
}

/** Where a request part sits in a validation error's path, e.g. "body/amount". */
export type RequestPart = "params" | "body" | "querystring";

/** Validates one part of a request; problems are reported per field, as the frontend expects. */
export function validatePart(
  part: RequestPart,
  schema: z.ZodType | undefined,
  data: unknown,
): unknown {
  if (!schema) return undefined;
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const issues = result.error.issues.map((issue) => ({
    path: [part, ...issue.path.map(String)].join("/"),
    message: issue.message,
  }));
  throw new AppError("VALIDATION", "Request is not valid", { issues });
}

/** The query string as an object; a repeated key becomes a list. */
export function queryObject(url: string): Record<string, string | string[]> {
  const query: Record<string, string | string[]> = {};
  for (const [key, value] of new URL(url).searchParams) {
    const existing = query[key];
    query[key] = existing === undefined ? value : [...[existing].flat(), value];
  }
  return query;
}

const JSON_TYPE = /^application\/([\w.-]+\+)?json\b/i;

/** The request's JSON body, or undefined when it has none. */
export async function readJsonBody(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text === "") return undefined;
  if (!JSON_TYPE.test(request.headers.get("content-type") ?? "")) {
    throw new AppError("UNSUPPORTED_MEDIA_TYPE", "Send the body as application/json");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new AppError("VALIDATION", "The body is not valid JSON");
  }
}

function isReply(value: unknown): value is Reply {
  return typeof value === "object" && value !== null && REPLY in value;
}

/** Sends a handler's result, through the reply schema for its status when there is one. */
export function send(c: Context, route: RouteDef, result: unknown): Response {
  if (result instanceof Response) return result;
  const { status, body, headers } = isReply(result)
    ? result
    : { status: 200, body: result, headers: {} };
  for (const [name, value] of Object.entries(headers)) c.header(name, value);
  const schema = route.schemas.response?.[status];
  const out: unknown = schema ? schema.parse(body) : body;
  // Hono types statuses narrowly; these come from the route's own schemas.
  const code = status as Parameters<Context["json"]>[1] & number;
  if (status === 204) return c.body(null, 204);
  return c.json(out, code);
}

/** A feature's routes: added to the table it is given, with the services' dependencies. */
export type RouteModule = (routes: RouteTable, ctx: AppContext) => void;
