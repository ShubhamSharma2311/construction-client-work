import type { DriverAccrual, Prisma } from "#prisma/client.ts";
import { fromDbDate, monthOf, toDbDate, type IsoDate } from "../../lib/dates.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import type { AccrualDto, DriverPaymentDto } from "./driver-salary.schema.ts";

/**
 * What the owner owes the driver: everything earned minus everything paid, live rows only.
 * With `before`, only what happened before that day (a ledger's opening balance).
 */
export async function driverBalance(
  db: Db | Tx,
  driverId: number,
  before?: IsoDate,
): Promise<number> {
  const cutoff = before === undefined ? undefined : { lt: toDbDate(before) };
  const [earned, paid] = await Promise.all([
    db.driverAccrual.aggregate({
      where: { driverId, deletedAt: null, accruedOn: cutoff },
      _sum: { amountPaise: true },
    }),
    db.driverPayment.aggregate({
      where: { driverId, deletedAt: null, paidOn: cutoff },
      _sum: { amountPaise: true },
    }),
  ]);
  return (earned._sum.amountPaise ?? 0) - (paid._sum.amountPaise ?? 0);
}

export function toAccrualDto(row: DriverAccrual): AccrualDto {
  return {
    id: row.id,
    kind: row.kind,
    month: row.month ? monthOf(fromDbDate(row.month)) : null,
    accruedOn: fromDbDate(row.accruedOn),
    amountPaise: row.amountPaise,
    note: row.note,
  };
}

export const driverPaymentInclude = {
  driver: { select: { id: true, name: true } },
} as const satisfies Prisma.DriverPaymentInclude;
type DriverPaymentRow = Prisma.DriverPaymentGetPayload<{ include: typeof driverPaymentInclude }>;

export function toDriverPaymentDto(row: DriverPaymentRow): DriverPaymentDto {
  return {
    id: row.id,
    driver: row.driver,
    paidOn: fromDbDate(row.paidOn),
    type: row.type,
    amountPaise: row.amountPaise,
    mode: row.mode,
    forMonth: row.forMonth ? monthOf(fromDbDate(row.forMonth)) : null,
    notes: row.notes,
    deletedAt: row.deletedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}
