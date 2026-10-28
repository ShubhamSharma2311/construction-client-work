import { z } from "zod";
import { dateRangeSchema, isoDateSchema } from "../../lib/dates.ts";
import { EXPENSE_CATEGORIES, expenseCategorySchema } from "../expenses/expenses.schema.ts";
import { payModeSchema } from "../trips/trips.schema.ts";

/** Reports need a closed range so totals mean something. */
export const reportRangeQuery = z
  .object({ from: isoDateSchema, to: isoDateSchema })
  .refine((range) => range.from <= range.to, {
    message: "from must be on or before to",
    path: ["from"],
  });
export type ReportRange = z.infer<typeof reportRangeQuery>;

export const cashbookQuery = dateRangeSchema.and(z.object({ mode: payModeSchema }));
export type CashbookQuery = z.infer<typeof cashbookQuery>;

export const dashboardQuery = z.object({ date: isoDateSchema.optional() });

const paise = z.number().int();

export const pnlResponse = z.object({
  from: z.string(),
  to: z.string(),
  revenue: z.object({
    tripsPaise: paise,
    writeOffsPaise: paise,
    netPaise: paise,
  }),
  expenses: z.object({
    byCategory: z.record(expenseCategorySchema, paise),
    totalPaise: paise,
  }),
  driverSalaryPaise: paise,
  profitPaise: paise,
});
export type Pnl = z.infer<typeof pnlResponse>;

export const cashLineKinds = [
  "CUSTOMER_PAYMENT",
  "FROM_PARTNER",
  "EXPENSE",
  "DRIVER_PAYMENT",
  "TO_PARTNER",
] as const;

export const cashbookResponse = z.object({
  mode: payModeSchema,
  from: z.string().nullable(),
  to: z.string().nullable(),
  openingPaise: paise,
  lines: z.array(
    z.object({
      date: z.string(),
      kind: z.enum(cashLineKinds),
      refId: z.number().int(),
      description: z.string(),
      inPaise: paise,
      outPaise: paise,
      balancePaise: paise,
    }),
  ),
  totals: z.object({ inPaise: paise, outPaise: paise }),
  closingPaise: paise,
});
export type Cashbook = z.infer<typeof cashbookResponse>;
export type CashLine = Cashbook["lines"][number];

export const daySummary = z.object({
  date: z.string(),
  trips: z.number().int(),
  revenuePaise: paise,
  cashInPaise: paise,
  onlineInPaise: paise,
  /** Delivered but not paid that day. */
  newDuesPaise: paise,
  /** Money received that day other than at a delivery: old dues paid, or an advance. */
  duesRecoveredPaise: paise,
  expensesPaise: paise,
  driverPaymentsPaise: paise,
  partnerNetPaidPaise: paise,
});
export type DaySummary = z.infer<typeof daySummary>;

export const summaryResponse = z.object({
  from: z.string(),
  to: z.string(),
  days: z.array(daySummary),
  totals: daySummary.omit({ date: true }),
});
export type Summary = z.infer<typeof summaryResponse>;

export const dashboardResponse = z.object({
  date: z.string(),
  day: daySummary.omit({ date: true }),
  expensesByCategory: z.record(expenseCategorySchema, paise),
  cashInHandPaise: paise,
  onlineBalancePaise: paise,
  /** As of now, whatever day the dashboard shows. */
  totalDuesPaise: paise,
  /** As of now, whatever day the dashboard shows. */
  overdueEmis: z.number().int(),
  topDues: z.array(
    z.object({
      customer: z.object({ id: z.number().int(), name: z.string() }),
      balancePaise: paise,
      oldestDueDate: z.string(),
    }),
  ),
});
export type Dashboard = z.infer<typeof dashboardResponse>;

export const tractorReportResponse = z.object({
  from: z.string(),
  to: z.string(),
  tractors: z.array(
    z.object({
      tractor: z.object({ id: z.number().int(), regNumber: z.string(), label: z.string() }),
      trips: z.number().int(),
      revenuePaise: paise,
      dieselPaise: paise,
      servicePaise: paise,
      emiPaise: paise,
      otherPaise: paise,
      /** Revenue minus the costs booked against this tractor. */
      contributionPaise: paise,
    }),
  ),
});
export type TractorReport = z.infer<typeof tractorReportResponse>;

export const khetReportResponse = z.object({
  from: z.string(),
  to: z.string(),
  khets: z.array(
    z.object({
      khet: z.object({ id: z.number().int(), name: z.string() }),
      trips: z.number().int(),
      revenuePaise: paise,
    }),
  ),
});
export type KhetReport = z.infer<typeof khetReportResponse>;

export const driverReportResponse = z.object({
  from: z.string(),
  to: z.string(),
  drivers: z.array(
    z.object({
      driver: z.object({ id: z.number().int(), name: z.string() }),
      trips: z.number().int(),
      revenuePaise: paise,
      dieselLitres: z.number(),
      dieselPaise: paise,
      salaryEarnedPaise: paise,
      advancesPaise: paise,
      salaryPaidPaise: paise,
    }),
  ),
});
export type DriverReport = z.infer<typeof driverReportResponse>;

export const partnerShareResponse = z.object({
  partner: z.object({ id: z.number().int(), name: z.string(), sharePercent: z.number() }),
  from: z.string(),
  to: z.string(),
  profitPaise: paise,
  shareDuePaise: paise,
  netPaidPaise: paise,
  /** Positive: still owed to the partner. Negative: paid more than the share. */
  balancePaise: paise,
});
export type PartnerShare = z.infer<typeof partnerShareResponse>;

export function emptyByCategory(): Record<(typeof EXPENSE_CATEGORIES)[number], number> {
  return Object.fromEntries(EXPENSE_CATEGORIES.map((category) => [category, 0])) as Record<
    (typeof EXPENSE_CATEGORIES)[number],
    number
  >;
}
