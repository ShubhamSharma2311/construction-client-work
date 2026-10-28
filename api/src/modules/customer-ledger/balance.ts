import { z } from "zod";
import type { Db, Tx } from "../../lib/prisma.ts";

export const customerBalanceDto = z.object({
  /** Billed minus everything paid or written off; negative means the customer is in credit. */
  balancePaise: z.number().int(),
  /** Unpaid part of the customer's trips. */
  duePaise: z.number().int(),
  /** Paid money not yet set against any trip. */
  creditPaise: z.number().int(),
});
export type CustomerBalance = z.infer<typeof customerBalanceDto>;

/**
 * A customer's standing from live (not deleted) rows. balance = due - credit holds because
 * a live write-off is always fully set against trips (a deferred database trigger refuses
 * anything else at commit).
 */
export async function customerBalance(tx: Db | Tx, customerId: number): Promise<CustomerBalance> {
  const [rows] = await tx.$queryRaw<
    { billed: bigint; paid: bigint; due: bigint; credit: bigint }[]
  >`
    SELECT
      (SELECT COALESCE(SUM("amountPaise"), 0) FROM "Trip"
        WHERE "customerId" = ${customerId} AND "deletedAt" IS NULL) AS billed,
      (SELECT COALESCE(SUM("amountPaise" - "receivedPaise"), 0) FROM "Trip"
        WHERE "customerId" = ${customerId} AND "deletedAt" IS NULL) AS due,
      (SELECT COALESCE(SUM("amountPaise"), 0) FROM "CustomerPayment"
        WHERE "customerId" = ${customerId} AND "deletedAt" IS NULL) AS paid,
      (SELECT COALESCE(SUM("amountPaise" - "allocatedPaise"), 0) FROM "CustomerPayment"
        WHERE "customerId" = ${customerId} AND "deletedAt" IS NULL AND "kind" = 'PAYMENT') AS credit`;
  if (!rows) throw new Error(`Balance query returned no row for customer ${String(customerId)}`);
  return {
    balancePaise: Number(rows.billed - rows.paid),
    duePaise: Number(rows.due),
    creditPaise: Number(rows.credit),
  };
}
