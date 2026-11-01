import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach } from "vitest";
import { buildApp, type App, type AppDeps } from "../src/app.ts";
import { silentLog } from "../src/lib/log.ts";
import type { Clock } from "../src/lib/clock.ts";
import type { ErrorBody } from "../src/lib/errors.ts";
import type { Mailer } from "../src/lib/mailer.ts";
import type { Db } from "../src/lib/prisma.ts";
import { hashPassword } from "../src/modules/auth/password.ts";
import { signAccessToken } from "../src/modules/auth/tokens.ts";
import { createTestPrisma, resetDb } from "./db.ts";
import { TestResponse } from "./response.ts";

export { TestResponse };

/** 12:00 IST on 28 Oct 2026; every test starts here unless it moves the clock. */
export const TEST_NOW = new Date("2026-10-28T06:30:00.000Z");
export const OWNER = { username: "owner", password: "owner-password-1" } as const;
export const ALLOWED_ORIGIN = "http://localhost:5173";

export function testJwtSecret(): string {
  const jwtSecret = process.env["JWT_SECRET"];
  if (!jwtSecret) throw new Error("JWT_SECRET is not set; vitest loads it from .env.test");
  return jwtSecret;
}

export interface TestAppOptions {
  /** Mark the refresh cookie Secure, as production over HTTPS does. */
  secureCookies?: boolean;
  /** Defaults to one that fails the test, since only email tests should send any. */
  mailer?: Mailer;
  /** Enables the one-time owner setup route. */
  setupToken?: string;
}

export const TEST_APP_URL = "http://ledger.test";

const noMail: Mailer = {
  send(email) {
    return Promise.reject(new Error(`unexpected email to ${email.to}: ${email.subject}`));
  },
};

export function testDeps(db: Db, clock: Clock, options: TestAppOptions = {}): AppDeps {
  return {
    db,
    clock,
    log: silentLog,
    jwtSecret: testJwtSecret(),
    corsOrigins: [ALLOWED_ORIGIN],
    secureCookies: options.secureCookies ?? false,
    mailer: options.mailer ?? noMail,
    appUrl: TEST_APP_URL,
    setupToken: options.setupToken,
  };
}

/** The `error` part of a failed response, typed. */
export function errorOf(response: TestResponse): ErrorBody["error"] {
  return response.json<ErrorBody>().error;
}

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface RequestOptions {
  method: Method;
  url: string;
  body?: unknown;
  /** Defaults to a fresh random key; pass one to replay a request. */
  idempotencyKey?: string;
  /** Defaults to true: send the owner's bearer token. */
  auth?: boolean;
  headers?: Record<string, string>;
  /** The visitor's address as Cloudflare reports it; defaults to 127.0.0.1. */
  remoteAddress?: string;
}

export interface TestContext {
  readonly db: Db;
  readonly app: App;
  readonly ownerId: number;
  readonly now: Date;
  setNow(at: Date | string): void;
  request(options: RequestOptions): Promise<TestResponse>;
  get(url: string): Promise<TestResponse>;
  post(url: string, body?: unknown, idempotencyKey?: string): Promise<TestResponse>;
  patch(url: string, body: unknown): Promise<TestResponse>;
  put(url: string, body: unknown): Promise<TestResponse>;
  delete(url: string): Promise<TestResponse>;
}

/**
 * Builds one app per test file and gives every test an empty database holding only
 * the owner. Requests carry a token signed at the test clock's current time.
 */
export function useTestApp(appOptions: TestAppOptions = {}): TestContext {
  const state = { now: TEST_NOW, ownerId: 0, ownerHash: "" };
  let db: Db | undefined;
  let app: App | undefined;

  const required = <T>(value: T | undefined, name: string): T => {
    if (value === undefined) throw new Error(`${name} is used before beforeAll ran`);
    return value;
  };

  beforeAll(async () => {
    db = createTestPrisma();
    app = buildApp(testDeps(db, () => state.now, appOptions));
    state.ownerHash = await hashPassword(OWNER.password);
  });

  beforeEach(async () => {
    const database = required(db, "db");
    await resetDb(database);
    state.now = TEST_NOW;
    const owner = await database.user.create({
      data: { username: OWNER.username, passwordHash: state.ownerHash },
    });
    state.ownerId = owner.id;
  });

  afterAll(async () => {
    await db?.$disconnect();
  });

  const request = async (options: RequestOptions): Promise<TestResponse> => {
    const headers: Record<string, string> = { "idempotency-key": randomUUID() };
    if (options.idempotencyKey !== undefined) headers["idempotency-key"] = options.idempotencyKey;
    if (options.auth !== false) {
      const { token } = await signAccessToken(state.ownerId, testJwtSecret(), state.now);
      headers["authorization"] = `Bearer ${token}`;
    }
    headers["cf-connecting-ip"] = options.remoteAddress ?? "127.0.0.1";
    if (options.body !== undefined) headers["content-type"] = "application/json";
    // A test that sets its own headers (e.g. a bad Authorization) must be the one that wins.
    Object.assign(headers, options.headers);
    const response = await required(app, "app").request(options.url, {
      method: options.method,
      headers,
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });
    return TestResponse.from(response);
  };

  return {
    get db() {
      return required(db, "db");
    },
    get app() {
      return required(app, "app");
    },
    get ownerId() {
      return state.ownerId;
    },
    get now() {
      return state.now;
    },
    setNow(at) {
      state.now = typeof at === "string" ? new Date(at) : at;
    },
    request,
    get: (url) => request({ method: "GET", url }),
    post: (url, body, idempotencyKey) =>
      request({
        method: "POST",
        url,
        body,
        ...(idempotencyKey === undefined ? {} : { idempotencyKey }),
      }),
    patch: (url, body) => request({ method: "PATCH", url, body }),
    put: (url, body) => request({ method: "PUT", url, body }),
    delete: (url) => request({ method: "DELETE", url }),
  };
}
