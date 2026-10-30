import { z } from "zod";
import { notFound } from "../../lib/errors.ts";
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
 * A customer's standing from live (not deleted) rows, read from the CustomerTotals view that
 * the dues list also uses. balance = due - credit holds because a live write-off is always
 * fully set against trips (a deferred database trigger refuses anything else at commit).
 */
export async function customerBalance(db: Db | Tx, customerId: number): Promise<CustomerBalance> {
  const [row] = await db.$queryRaw<{ balance: bigint; due: bigint; credit: bigint }[]>`
    SELECT balance, due, credit FROM "CustomerTotals" WHERE "customerId" = ${customerId}`;
  if (!row)
    throw new Error(`No totals for customer ${String(customerId)}; does the customer exist?`);
  return {
    balancePaise: Number(row.balance),
    duePaise: Number(row.due),
    creditPaise: Number(row.credit),
  };
}

/**
 * One customer's standing for their account screen. The dues list holds only customers who
 * owe, so a customer in credit can be read only from here.
 */
export async function balanceOfCustomer(db: Db, customerId: number): Promise<CustomerBalance> {
  const customer = await db.customer.findUnique({
    where: { id: customerId },
    select: { id: true },
  });
  if (!customer) throw notFound("Customer", customerId);
  return customerBalance(db, customerId);
}
