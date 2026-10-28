import { randomUUID } from "node:crypto";
import type { IncomingMessage, Server, ServerResponse } from "node:http";
import cors from "@fastify/cors";
import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import {
  hasZodFastifySchemaValidationErrors,
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import type { AppContext } from "./app-context.ts";
import type { Env } from "./config/env.ts";
import { AppError, type ErrorBody } from "./lib/errors.ts";
import { authPrivateRoutes, authPublicRoutes } from "./modules/auth/auth.routes.ts";
import { requireAuth } from "./modules/auth/authenticate.ts";
import { healthRoutes } from "./modules/health/health.routes.ts";

export interface AppDeps extends AppContext {
  logLevel: Env["LOG_LEVEL"];
  corsOrigins: string[];
  trustProxyHops: number;
}

export type App = FastifyInstance<
  Server,
  IncomingMessage,
  ServerResponse,
  FastifyBaseLogger,
  ZodTypeProvider
>;

/** Anything a handler or Fastify itself may throw; non-Fastify errors can lack `code`. */
type HandledError = Error & { statusCode?: number; code?: string; validationContext?: string };

export function buildApp(deps: AppDeps): App {
  const app = Fastify({
    logger: { level: deps.logLevel },
    genReqId: () => randomUUID(),
    requestIdHeader: false,
    trustProxy: trustFirstHops(deps.trustProxyHops),
  }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  app.decorateRequest("userId", 0);

  app.addHook("onSend", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler<HandledError>((error, request, reply) => {
    const { status, body } = toErrorResponse(error, request.id);
    if (status >= 500) request.log.error({ err: error }, "request failed");
    return reply.status(status).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body = errorBody(
      "NOT_FOUND",
      `Route ${request.method} ${request.url} not found`,
      request.id,
    );
    return reply.status(404).send(body);
  });

  const ctx: AppContext = { db: deps.db, clock: deps.clock, jwtSecret: deps.jwtSecret };

  app.register(cors, {
    origin: deps.corsOrigins,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key"],
    exposedHeaders: ["x-request-id"],
  });
  app.register(healthRoutes, { db: deps.db });
  app.register(authPublicRoutes, ctx);

  // Everything registered in this scope requires a valid access token.
  app.register((scope, _opts, done) => {
    scope.addHook("onRequest", requireAuth(ctx));
    scope.register(authPrivateRoutes, ctx);
    done();
  });

  return app;
}

/**
 * Fastify 5 ignores a numeric trustProxy because a hop count cannot check who the peer is.
 * On Cloud Run every request arrives through Google's front end, so the first `hops`
 * addresses are proxies we control and the next one is the real client.
 */
function trustFirstHops(hops: number): false | ((address: string, hop: number) => boolean) {
  return hops > 0 ? (_address, hop) => hop < hops : false;
}

function toErrorResponse(
  error: HandledError,
  requestId: string,
): { status: number; body: ErrorBody } {
  if (error instanceof AppError) {
    return {
      status: error.httpStatus,
      body: errorBody(error.code, error.message, requestId, error.details),
    };
  }
  if (hasZodFastifySchemaValidationErrors(error)) {
    const issues = error.validation.map((issue) => ({
      path: `${error.validationContext ?? ""}${issue.instancePath}`,
      message: issue.message,
    }));
    return {
      status: 400,
      body: errorBody("VALIDATION", "Request is not valid", requestId, { issues }),
    };
  }
  // Fastify's own client errors: malformed JSON, wrong content type, body too large.
  if (error.statusCode !== undefined && error.statusCode >= 400 && error.statusCode < 500) {
    const code = error.code ?? "BAD_REQUEST";
    return { status: error.statusCode, body: errorBody(code, error.message, requestId) };
  }
  return { status: 500, body: errorBody("INTERNAL", "Something went wrong", requestId) };
}

function errorBody(code: string, message: string, requestId: string, details?: unknown): ErrorBody {
  return { error: { code, message, requestId, ...(details === undefined ? {} : { details }) } };
}
