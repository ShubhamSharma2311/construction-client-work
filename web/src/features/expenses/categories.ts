import type { ExpenseCategory } from "../../api/types.ts";

/** How each kind of expense is named on screen, in the order the register lists them. */
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

export const EXPENSE_CATEGORIES = Object.keys(EXPENSE_CATEGORY_LABELS) as ExpenseCategory[];
