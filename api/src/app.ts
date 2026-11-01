import { type Context, Hono } from "hono";
import { cors } from "hono/cors";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import type { AppContext } from "./app-context.ts";
import { AppError, type ErrorBody } from "./lib/errors.ts";
import { oneRequestAtATime } from "./lib/one-at-a-time.ts";
import { fromPrismaError } from "./lib/prisma-errors.ts";
import {
  queryObject,
  readJsonBody,
  type RouteDef,
  type RouteModule,
  type RouteRequest,
  type RouteSchemas,
  RouteTable,
  send,
  validatePart,
} from "./lib/route.ts";
import { authPrivateRoutes, authPublicRoutes } from "./modules/auth/auth.routes.ts";
import { authenticate } from "./modules/auth/authenticate.ts";
import { auditRoutes } from "./modules/audit/audit.routes.ts";
import { ledgerRoutes } from "./modules/customer-ledger/ledger.routes.ts";
import { customerRoutes } from "./modules/customers/customers.routes.ts";
import { dieselRoutes } from "./modules/diesel/diesel.routes.ts";
import { driverSalaryRoutes } from "./modules/driver-salary/driver-salary.routes.ts";
import { driverRoutes } from "./modules/drivers/drivers.routes.ts";
import { expenseRoutes } from "./modules/expenses/expenses.routes.ts";
import { healthRoutes } from "./modules/health/health.routes.ts";
import { khetRoutes } from "./modules/khets/khets.routes.ts";
import { labourerRoutes } from "./modules/labourers/labourers.routes.ts";
import { loanRoutes } from "./modules/loans/loans.routes.ts";
import { partnerAccountRoutes } from "./modules/partner-account/partner-account.routes.ts";
import { partnerRoutes } from "./modules/partners/partners.routes.ts";
import { paymentRoutes } from "./modules/payments/payments.routes.ts";
import { reportRoutes } from "./modules/reports/reports.routes.ts";
import { settingsRoutes } from "./modules/settings/settings.routes.ts";
import { serviceHistoryRoutes } from "./modules/tractor-service/service-history.routes.ts";
import { tractorRoutes } from "./modules/tractors/tractors.routes.ts";
import { tripRoutes } from "./modules/trips/trips.routes.ts";

export interface AppDeps extends AppContext {
  corsOrigins: string[];
}

type AppEnv = { Variables: { requestId: string } };
export type App = Hono<AppEnv>;

/** Reachable without a token. */
const PUBLIC_ROUTES: RouteModule[] = [healthRoutes, authPublicRoutes];

/** Every one of these requires a valid access token. */
const PRIVATE_ROUTES: RouteModule[] = [
  authPrivateRoutes,
  settingsRoutes,
  auditRoutes,
  customerRoutes,
  tractorRoutes,
  driverRoutes,
  khetRoutes,
  labourerRoutes,
  partnerRoutes,
  tripRoutes,
  paymentRoutes,
  ledgerRoutes,
  expenseRoutes,
  dieselRoutes,
  loanRoutes,
  serviceHistoryRoutes,
  driverSalaryRoutes,
  partnerAccountRoutes,
  reportRoutes,
];

/** Every route, as the app serves them and the API document describes them. */
export function routeList(ctx: AppContext): RouteDef[] {
  const open = new RouteTable(false);
  const signedIn = new RouteTable(true);
  for (const module of PUBLIC_ROUTES) module(open, ctx);
  for (const module of PRIVATE_ROUTES) module(signedIn, ctx);
  return [...open.routes, ...signedIn.routes];
}

export function buildApp(deps: AppDeps): App {
  const app = new Hono<AppEnv>();
  const { corsOrigins, ...ctx } = deps;

  app.use(async (c, next) => {
    const requestId = crypto.randomUUID();
    c.set("requestId", requestId);
    await next();
    c.res.headers.set("x-request-id", requestId);
  });
  app.use(
    cors({
      origin: corsOrigins,
      allowMethods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
      allowHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
      exposeHeaders: ["x-request-id"],
    }),
  );
  app.use(oneRequestAtATime());

  for (const route of routeList(ctx)) mountRoute(app, route, ctx);

  app.notFound((c) => {
    const url = new URL(c.req.url);
    const message = `Route ${c.req.method} ${url.pathname}${url.search} not found`;
    return c.json(errorBody("NOT_FOUND", message, c.get("requestId")), 404);
  });
  app.onError((error, c) => {
    const { status, body } = toErrorResponse(error, c.get("requestId"));
    if (status >= 500)
      ctx.log.error({ err: error, requestId: c.get("requestId") }, "request failed");
    return c.json(body, status);
  });
  return app;
}

/** Serves one route: sign-in first, then the request parts, then the handler's reply. */
export function mountRoute(app: App, route: RouteDef, ctx: AppContext): void {
  app.on(route.method.toUpperCase(), route.path, async (c) => {
    // Sign-in is checked before the request, so a stranger learns nothing from validation.
    const userId = route.requiresAuth ? await authenticate(c.req.header("authorization"), ctx) : 0;
    const params = validatePart("params", route.schemas.params, c.req.param());
    const body = route.schemas.body
      ? validatePart("body", route.schemas.body, await readJsonBody(c.req.raw))
      : undefined;
    const query = validatePart("querystring", route.schemas.query, queryObject(c.req.url));
    const request = {
      params,
      query,
      body,
      headers: c.req.raw.headers,
      userId,
      ip: visitorAddress(c),
      context: c,
    } as RouteRequest<RouteSchemas>;
    return send(c, route, await route.handler(request));
  });
}

/**
 * The visitor's address. Cloudflare sets this header itself and replaces any a visitor sends;
 * the local server sets it from the socket.
 */
function visitorAddress(c: Context): string {
  return c.req.header("cf-connecting-ip") ?? "unknown";
}

function toErrorResponse(
  error: Error,
  requestId: string,
): { status: ContentfulStatusCode; body: ErrorBody } {
  const appError = error instanceof AppError ? error : fromPrismaError(error);
  if (appError) {
    return {
      status: appError.httpStatus as ContentfulStatusCode,
      body: errorBody(appError.code, appError.message, requestId, appError.details),
    };
  }
  return { status: 500, body: errorBody("INTERNAL", "Something went wrong", requestId) };
}

function errorBody(code: string, message: string, requestId: string, details?: unknown): ErrorBody {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}
