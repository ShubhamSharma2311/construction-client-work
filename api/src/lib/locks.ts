import { Prisma } from "../generated/prisma/client.ts";
import type { Tx } from "./prisma.ts";

/** Tables whose rows are locked to serialise rule checks that read one row and write another. */
export type LockableTable = "Customer" | "Driver" | "Expense" | "Tractor" | "TractorLoan";

/**
 * Locks one row until the transaction ends. Two requests that check-then-write the same
 * row (deactivate a tractor while assigning it) then run one after the other.
 */
export async function lockRow(tx: Tx, table: LockableTable, id: number): Promise<void> {
  await tx.$executeRaw`SELECT 1 FROM ${Prisma.raw(`"${table}"`)} WHERE id = ${id} FOR UPDATE`;
}
