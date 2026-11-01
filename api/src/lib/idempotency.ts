import { createHash } from "node:crypto";
import { z } from "zod";
import type { Prisma } from "../generated/prisma/client.ts";
import { AppError } from "./errors.ts";
import type { Db, Tx } from "./prisma.ts";

export const IDEMPOTENCY_HEADER = "idempotency-key";

const keySchema = z
  .string()
  .min(8)
  .max(128)
  .regex(/^[A-Za-z0-9_-]+$/);

export function readIdempotencyKey(headers: Record<string, string | string[] | undefined>): string {
  const raw = headers[IDEMPOTENCY_HEADER];
  if (raw === undefined) {
    throw new AppError("VALIDATION", "Idempotency-Key header is required");
  }
  const parsed = keySchema.safeParse(raw);
  if (!parsed.success) {
    throw new AppError(
      "VALIDATION",
      "Idempotency-Key must be one value of 8-128 letters, digits, '-' or '_'",
    );
  }
  return parsed.data;
}

export interface IdempotentRequest {
  key: string;
  route: string;
  body: unknown;
}

export interface WorkResult<T extends Prisma.InputJsonValue> {
  statusCode: number;
  body: T;
}

export interface IdempotentResult<T extends Prisma.InputJsonValue> extends WorkResult<T> {
  replayed: boolean;
}

/**
 * Runs `work` at most once per key. The key is claimed in the same transaction as the
 * work, so a record and its key always commit or roll back together. A concurrent request
 * with the same key waits on the claim, then replays the stored response.
 * Failed work stores nothing, so the client may retry with the same key.
 */
export async function runIdempotent<T extends Prisma.InputJsonValue>(
  db: Db,
  request: IdempotentRequest,
  work: (tx: Tx) => Promise<WorkResult<T>>,
): Promise<IdempotentResult<T>> {
  const requestHash = hashRequest(request.route, request.body);

  return db.$transaction(async (tx) => {
    const claimed = await tx.$executeRaw`
      INSERT INTO "IdempotencyKey" ("key", "route", "requestHash", "statusCode", "responseBody")
      VALUES (${request.key}, ${request.route}, ${requestHash}, 0, '{}')
      ON CONFLICT ("key") DO NOTHING`;

    if (claimed === 0) {
      const stored = await tx.idempotencyKey.findUniqueOrThrow({ where: { key: request.key } });
      if (stored.route !== request.route || stored.requestHash !== requestHash) {
        throw new AppError(
          "IDEMPOTENCY_MISMATCH",
          "This Idempotency-Key was already used for a different request",
          { route: stored.route },
        );
      }
      // The stored body was written by this function from a value of type T.
      return { statusCode: stored.statusCode, body: stored.responseBody as T, replayed: true };
    }

    const result = await work(tx);
    // Answer from the stored row so the first response and every replay have one JSON shape.
    const saved = await tx.idempotencyKey.update({
      where: { key: request.key },
      data: { statusCode: result.statusCode, responseBody: result.body },
    });
    return { statusCode: saved.statusCode, body: saved.responseBody as T, replayed: false };
  }, TRANSACTION_LIMITS);
}

// A duplicate request holds a pooled connection while it waits for the first one's claim,
// so both limits are explicit rather than Prisma's silent 2s/5s defaults.
const TRANSACTION_LIMITS = { maxWait: 5_000, timeout: 10_000 } as const;

function hashRequest(route: string, body: unknown): string {
  return createHash("sha256").update(canonicalJson({ route, body })).digest("hex");
}

/**
 * JSON with object keys sorted, so key order in the request does not change the hash.
 * Only plain objects are walked: a Date or Map has no own keys and would hash as "{}",
 * letting two different requests share a key.
 */
function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const prototype: unknown = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new Error(
        `Cannot hash request body value of type ${value.constructor.name}; ` +
          "idempotent routes must hash the plain JSON body",
      );
    }
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item)}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value);
}
