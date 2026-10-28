import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestPrisma, resetDb } from "../../test/db.ts";
import { writeAudit } from "./audit.ts";
import { AppError } from "./errors.ts";
import { readIdempotencyKey, runIdempotent } from "./idempotency.ts";
import type { Tx } from "./prisma.ts";

const db = createTestPrisma();

beforeEach(async () => {
  await resetDb(db);
});

afterAll(async () => {
  await db.$disconnect();
});

/** Stands in for a money write: one audit row per real execution. */
async function recordTrip(tx: Tx) {
  await writeAudit(tx, { entity: "Trip", entityId: 1, action: "CREATE", after: { a: 1 } });
  return { statusCode: 201, body: { tripId: 1 } };
}

const request = { key: "key-00000001", route: "POST /trips", body: { amount: "1500", note: "x" } };

describe("runIdempotent", () => {
  it("runs the work once and stores its response", async () => {
    const result = await runIdempotent(db, request, recordTrip);

    expect(result).toEqual({ statusCode: 201, body: { tripId: 1 }, replayed: false });
    expect(await db.auditLog.count()).toBe(1);
    expect(await db.idempotencyKey.findUnique({ where: { key: request.key } })).toMatchObject({
      statusCode: 201,
      responseBody: { tripId: 1 },
    });
  });

  it("replays the stored response without running the work again", async () => {
    await runIdempotent(db, request, recordTrip);
    const work = vi.fn(recordTrip);

    const replay = await runIdempotent(db, request, work);

    expect(replay).toEqual({ statusCode: 201, body: { tripId: 1 }, replayed: true });
    expect(work).not.toHaveBeenCalled();
    expect(await db.auditLog.count()).toBe(1);
  });

  it("treats a body with keys in a different order as the same request", async () => {
    await runIdempotent(db, request, recordTrip);

    const replay = await runIdempotent(
      db,
      { ...request, body: { note: "x", amount: "1500" } },
      recordTrip,
    );

    expect(replay.replayed).toBe(true);
  });

  it("rejects the same key with a different body", async () => {
    await runIdempotent(db, request, recordTrip);

    await expect(
      runIdempotent(db, { ...request, body: { amount: "9999", note: "x" } }, recordTrip),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH", httpStatus: 422 });
  });

  it("rejects the same key on a different route", async () => {
    await runIdempotent(db, request, recordTrip);

    await expect(
      runIdempotent(db, { ...request, route: "POST /expenses" }, recordTrip),
    ).rejects.toBeInstanceOf(AppError);
  });

  it("stores nothing when the work fails, so a retry runs it", async () => {
    await expect(
      runIdempotent(db, request, () => Promise.reject(new AppError("CONFLICT", "rule failed"))),
    ).rejects.toThrow("rule failed");
    expect(await db.idempotencyKey.count()).toBe(0);

    const retry = await runIdempotent(db, request, recordTrip);
    expect(retry.replayed).toBe(false);
    expect(await db.auditLog.count()).toBe(1);
  });

  it("refuses to hash a body holding a non-plain object, which would hide its value", async () => {
    await expect(
      runIdempotent(db, { ...request, body: { tripDate: new Date("2026-10-28") } }, recordTrip),
    ).rejects.toThrow("Cannot hash request body value of type Date");
    expect(await db.auditLog.count()).toBe(0);
  });

  it("returns the same body shape on the first call and on a replay", async () => {
    const withDate = async (tx: Tx) => {
      await recordTrip(tx);
      return { statusCode: 201, body: { at: new Date("2026-10-28T00:00:00Z") } };
    };

    const first = await runIdempotent(db, request, withDate);
    const replay = await runIdempotent(db, request, withDate);

    expect(first.body).toEqual({ at: "2026-10-28T00:00:00.000Z" });
    expect(replay.body).toEqual(first.body);
  });

  it("executes exactly once when the same key arrives concurrently", async () => {
    const slowTrip = async (tx: Tx) => {
      const result = await recordTrip(tx);
      await new Promise((resolve) => setTimeout(resolve, 50));
      return result;
    };

    const results = await Promise.all(
      Array.from({ length: 5 }, () => runIdempotent(db, request, slowTrip)),
    );

    expect(results.filter((result) => !result.replayed)).toHaveLength(1);
    expect(new Set(results.map((result) => JSON.stringify(result.body))).size).toBe(1);
    expect(await db.auditLog.count()).toBe(1);
    expect(await db.idempotencyKey.count()).toBe(1);
  });
});

describe("readIdempotencyKey", () => {
  it("returns a valid key", () => {
    expect(readIdempotencyKey({ "idempotency-key": "trip_2026-10-28_ab12" })).toBe(
      "trip_2026-10-28_ab12",
    );
  });

  it.each([
    [{}, "is required"],
    [{ "idempotency-key": "short" }, "must be one value"],
    [{ "idempotency-key": "has space in it" }, "must be one value"],
    [{ "idempotency-key": ["key-00000001", "key-00000002"] }, "must be one value"],
  ])("rejects %j", (headers, message) => {
    expect(() => readIdempotencyKey(headers)).toThrow(message);
  });
});
