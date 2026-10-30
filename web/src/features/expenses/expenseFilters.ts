import type { ExpenseCategory } from "../../api/types.ts";
import {
  readChoice,
  readIdParam,
  readRange,
  writeRange,
  writeSet,
} from "../../lib/addressFilters.ts";
import type { DateRange } from "../../lib/ranges.ts";
import { EXPENSE_CATEGORIES } from "./categories.ts";

export type PayMode = "CASH" | "ONLINE";
export const PAY_MODES = ["CASH", "ONLINE"] as const satisfies readonly PayMode[];

export interface ExpenseFilters {
  range: DateRange | null;
  category: ExpenseCategory | "";
  tractorId: string;
  driverId: string;
  labourerId: string;
  mode: PayMode | "";
  deleted: boolean;
}

export function readExpenseFilters(
  params: URLSearchParams,
  defaultRange: DateRange | null,
): ExpenseFilters {
  return {
    range: readRange(params, defaultRange),
    category: readChoice(params, "category", EXPENSE_CATEGORIES),
    tractorId: readIdParam(params, "tractor"),
    driverId: readIdParam(params, "driver"),
    labourerId: readIdParam(params, "labourer"),
    mode: readChoice(params, "mode", PAY_MODES),
    deleted: params.get("deleted") === "true",
  };
}

export function writeExpenseFilters(filters: ExpenseFilters): Record<string, string> {
  return {
    ...writeRange(filters.range),
    ...writeSet({
      category: filters.category,
      tractor: filters.tractorId,
      driver: filters.driverId,
      labourer: filters.labourerId,
      mode: filters.mode,
      deleted: filters.deleted ? "true" : "",
    }),
  };
}

/** The query the API takes for these filters (without paging). */
export function expenseQuery(filters: ExpenseFilters) {
  return {
    ...(filters.range ? { from: filters.range.from, to: filters.range.to } : {}),
    ...(filters.category ? { category: filters.category } : {}),
    ...(filters.tractorId ? { tractorId: Number(filters.tractorId) } : {}),
    ...(filters.driverId ? { driverId: Number(filters.driverId) } : {}),
    ...(filters.labourerId ? { labourerId: Number(filters.labourerId) } : {}),
    ...(filters.mode ? { mode: filters.mode } : {}),
    ...(filters.deleted ? { deleted: "true" as const } : {}),
  };
}
