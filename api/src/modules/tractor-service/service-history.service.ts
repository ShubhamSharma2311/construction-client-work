import { notFound } from "../../lib/errors.ts";
import type { Db } from "../../lib/prisma.ts";
import { expenseInclude, toExpenseDto } from "../expenses/expenses.service.ts";
import type { ServiceHistory } from "./service-history.schema.ts";

/** Every service done on a tractor, newest first, with the last one up front. */
export async function serviceHistory(db: Db, tractorId: number): Promise<ServiceHistory> {
  const tractor = await db.tractor.findUnique({ where: { id: tractorId } });
  if (!tractor) throw notFound("Tractor", tractorId);
  const rows = await db.expense.findMany({
    where: { category: "TRACTOR_SERVICE", tractorId, deletedAt: null },
    include: expenseInclude,
    orderBy: [{ spentOn: "desc" }, { id: "desc" }],
  });
  const services = rows.map(toExpenseDto);
  const last = services[0];
  return {
    tractor: { id: tractor.id, regNumber: tractor.regNumber, label: tractor.label },
    lastService: last ? { date: last.spentOn, hourMeter: last.hourMeter, notes: last.notes } : null,
    services,
  };
}
