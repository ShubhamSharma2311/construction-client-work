import { writeAudit } from "../../lib/audit.ts";
import { toDbDate } from "../../lib/dates.ts";
import { AppError, notFound } from "../../lib/errors.ts";
import { runIdempotent, type IdempotentResult } from "../../lib/idempotency.ts";
import type { Db } from "../../lib/prisma.ts";
import { customerBalance } from "../customer-ledger/balance.ts";
import { getBusinessBounds } from "../settings/settings.service.ts";
import type { OpeningBalanceInput, TripSaved } from "./trips.schema.ts";
import { toTripDto, tripInclude } from "./trips.service.ts";

/**
 * Records what a customer already owed in the paper register. It is dated the business
 * start, so it is the oldest due and is paid off first.
 */
export async function createOpeningBalance(
  db: Db,
  customerId: number,
  input: OpeningBalanceInput,
  idempotencyKey: string,
  now: Date,
): Promise<IdempotentResult<TripSaved>> {
  const request = {
    key: idempotencyKey,
    route: `POST /customers/${String(customerId)}/opening-balance`,
    body: input,
  };
  return runIdempotent(db, request, async (tx) => {
    const bounds = await getBusinessBounds(tx, now);
    const customer = await tx.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw notFound("Customer", customerId);
    if (!customer.isActive) throw new AppError("CONFLICT", `Customer ${customer.name} is inactive`);
    const existing = await tx.trip.findFirst({
      where: { customerId, kind: "OPENING_BALANCE", deletedAt: null },
    });
    if (existing) {
      throw new AppError(
        "CONFLICT",
        `${customer.name} already has opening balance #${String(existing.id)}; edit that one`,
      );
    }

    const created = await tx.trip.create({
      data: {
        kind: "OPENING_BALANCE",
        tripDate: toDbDate(bounds.businessStartDate),
        customerId,
        amountPaise: input.amount,
        notes: input.notes ?? null,
      },
      include: tripInclude,
    });
    await writeAudit(tx, {
      entity: "Trip",
      entityId: created.id,
      action: "CREATE",
      after: created,
    });
    return {
      statusCode: 201,
      body: {
        trip: toTripDto(created),
        customerBalance: await customerBalance(tx, customerId),
        warnings: [],
      },
    };
  });
}
