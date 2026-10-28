import { z } from "zod";
import { dateRangeSchema, isoDateSchema } from "../../lib/dates.ts";
import { rupeesSchema } from "../../lib/money.ts";
import { paginationSchema } from "../../lib/pagination.ts";
import { dbIdSchema, nonEmptyPatch } from "../../lib/request-schemas.ts";
import { optionalText } from "../../lib/text.ts";
import { payModeSchema } from "../trips/trips.schema.ts";

export const EXPENSE_CATEGORIES = [
  "LABOUR",
  "DIESEL",
  "ROYALTY",
  "POLICE",
  "OTHER",
  "EMERGENCY",
  "TRACTOR_SERVICE",
  "TRACTOR_EMI",
] as const;
export const expenseCategorySchema = z.enum(EXPENSE_CATEGORIES);
export type ExpenseCategory = z.infer<typeof expenseCategorySchema>;

/** What the money was for: police, other and emergency spends need it written down. */
const requiredNotes = z.string().trim().min(1, "say what this was for").max(500);

const common = {
  spentOn: isoDateSchema,
  amount: rupeesSchema,
  mode: payModeSchema,
  reference: optionalText(100),
  notes: optionalText(500),
};

/** Both dates or neither: one end alone cannot be checked against other royalty periods. */
export function periodProblem(
  from: string | null | undefined,
  to: string | null | undefined,
): string | null {
  if (!from !== !to) return "give both periodFrom and periodTo, or neither";
  if (from && to && from > to) return "periodFrom must be on or before periodTo";
  return null;
}

export const expenseCreateBody = z.discriminatedUnion("category", [
  z.object({ category: z.literal("LABOUR"), ...common, labourerId: dbIdSchema }).strict(),
  z
    .object({
      category: z.literal("ROYALTY"),
      ...common,
      periodFrom: isoDateSchema.optional(),
      periodTo: isoDateSchema.optional(),
    })
    .strict()
    .superRefine((body, ctx) => {
      const problem = periodProblem(body.periodFrom, body.periodTo);
      if (problem) ctx.addIssue({ code: "custom", message: problem, path: ["periodFrom"] });
    }),
  z.object({ category: z.literal("POLICE"), ...common, notes: requiredNotes }).strict(),
  z.object({ category: z.literal("OTHER"), ...common, notes: requiredNotes }).strict(),
  z
    .object({
      category: z.literal("EMERGENCY"),
      ...common,
      notes: requiredNotes,
      tractorId: dbIdSchema.optional(),
      driverId: dbIdSchema.optional(),
    })
    .strict(),
]);
export type ExpenseCreateInput = z.infer<typeof expenseCreateBody>;

/** Any field an expense can have; the service refuses fields its category does not take. */
export const expenseUpdateBody = nonEmptyPatch({
  spentOn: isoDateSchema.optional(),
  amount: rupeesSchema.optional(),
  mode: payModeSchema.optional(),
  reference: optionalText(100),
  notes: optionalText(500),
  labourerId: dbIdSchema.optional(),
  tractorId: dbIdSchema.nullable().optional(),
  driverId: dbIdSchema.nullable().optional(),
  periodFrom: isoDateSchema.nullable().optional(),
  periodTo: isoDateSchema.nullable().optional(),
});
export type ExpenseUpdateInput = z.infer<typeof expenseUpdateBody>;

export const expenseFilterQuery = dateRangeSchema.and(
  z.object({
    category: expenseCategorySchema.optional(),
    tractorId: dbIdSchema.optional(),
    driverId: dbIdSchema.optional(),
    labourerId: dbIdSchema.optional(),
    mode: payModeSchema.optional(),
    deleted: z.enum(["true", "false"]).default("false"),
  }),
);
export type ExpenseFilter = z.infer<typeof expenseFilterQuery>;

export const expenseListQuery = expenseFilterQuery.and(paginationSchema);
export type ExpenseListQuery = z.infer<typeof expenseListQuery>;

const ref = z.object({ id: z.number().int(), name: z.string() });

export const expenseDto = z.object({
  id: z.number().int(),
  category: expenseCategorySchema,
  spentOn: z.string(),
  amountPaise: z.number().int(),
  mode: payModeSchema,
  driver: ref.nullable(),
  tractor: z.object({ id: z.number().int(), regNumber: z.string() }).nullable(),
  labourer: ref.nullable(),
  dieselLitres: z.number().nullable(),
  hourMeter: z.number().int().nullable(),
  periodFrom: z.string().nullable(),
  periodTo: z.string().nullable(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type ExpenseDto = z.infer<typeof expenseDto>;

export const expenseSavedResponse = z.object({
  expense: expenseDto,
  warnings: z.array(z.string()),
});
export type ExpenseSaved = z.infer<typeof expenseSavedResponse>;

export const expensePageResponse = z.object({
  items: z.array(expenseDto),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totals: z.object({
    amountPaise: z.number().int(),
    byCategory: z.record(expenseCategorySchema, z.number().int()),
  }),
});
export type ExpensePage = z.infer<typeof expensePageResponse>;
