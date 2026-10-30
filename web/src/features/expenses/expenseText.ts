import type { ExpenseItem } from "../../api/types.ts";

/** Who or what the money went on: the labourer, the tractor and driver, or the note. */
export function expenseFor(expense: ExpenseItem): string {
  const parts = [expense.labourer?.name, expense.tractor?.regNumber, expense.driver?.name].filter(
    (part): part is string => Boolean(part),
  );
  if (expense.dieselLitres !== null) parts.push(`${String(expense.dieselLitres)} L`);
  if (parts.length > 0) return parts.join(", ");
  return expense.notes ?? "";
}
