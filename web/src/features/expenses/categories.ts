import type { ExpenseCategory } from "../../api/types.ts";

/** Every kind of expense, in the order the register lists them. */
export const EXPENSE_CATEGORIES = [
  "DIESEL",
  "LABOUR",
  "ROYALTY",
  "POLICE",
  "TRACTOR_SERVICE",
  "TRACTOR_EMI",
  "EMERGENCY",
  "OTHER",
] as const satisfies readonly ExpenseCategory[];

// A Record over the API's own type, so a category the API adds fails the build here.
export const EXPENSE_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  DIESEL: "Diesel",
  LABOUR: "Labour",
  ROYALTY: "Royalty",
  POLICE: "Police",
  TRACTOR_SERVICE: "Tractor service",
  TRACTOR_EMI: "Tractor EMI",
  EMERGENCY: "Emergency",
  OTHER: "Other",
};
