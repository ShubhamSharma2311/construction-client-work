import { z } from "zod";
import { isoDateSchema, isoMonthSchema } from "../../lib/dates.ts";
import { rupeesOrZeroSchema, rupeesSchema } from "../../lib/money.ts";
import { dbIdSchema, nonEmptyPatch } from "../../lib/request-schemas.ts";
import { nameSchema, optionalText } from "../../lib/text.ts";
import { payModeSchema } from "../trips/trips.schema.ts";

export const loanCreateBody = z
  .object({
    lender: nameSchema,
    emiAmount: rupeesSchema,
    /** 1-28, so the EMI date exists in February too. */
    emiDay: z.number().int().min(1).max(28),
    firstEmiMonth: isoMonthSchema,
    totalInstallments: z.number().int().min(1).max(120),
    notes: optionalText(500),
  })
  .strict();
export type LoanCreateInput = z.infer<typeof loanCreateBody>;

export const loanUpdateBody = nonEmptyPatch({
  lender: nameSchema.optional(),
  notes: optionalText(500),
});
export type LoanUpdateInput = z.infer<typeof loanUpdateBody>;

export const loanListQuery = z.object({
  tractorId: dbIdSchema.optional(),
  status: z.enum(["open", "closed", "all"]).default("open"),
});
export type LoanListQuery = z.infer<typeof loanListQuery>;

export const emiPaymentBody = z
  .object({
    emiMonth: isoMonthSchema,
    paidOn: isoDateSchema,
    /** The instalment itself; a late fee is entered separately. */
    amount: rupeesSchema,
    lateFee: rupeesOrZeroSchema.optional(),
    mode: payModeSchema,
    reference: optionalText(100),
    notes: optionalText(500),
  })
  .strict();
export type EmiPaymentInput = z.infer<typeof emiPaymentBody>;

export const foreclosureBody = z
  .object({
    closedOn: isoDateSchema,
    amount: rupeesSchema,
    mode: payModeSchema,
    reference: optionalText(100),
    notes: optionalText(500),
  })
  .strict();
export type ForeclosureInput = z.infer<typeof foreclosureBody>;

export const loanPaymentParams = z.object({ id: dbIdSchema, expenseId: dbIdSchema });

export const emiDueQuery = z.object({ days: z.coerce.number().int().min(0).max(60).default(7) });
export type EmiDueQuery = z.infer<typeof emiDueQuery>;

const statusSchema = z.enum(["PAID", "OVERDUE", "DUE_TODAY", "UPCOMING", "CLOSED"]);

const instalmentDto = z.object({
  number: z.number().int(),
  month: z.string(),
  dueDate: z.string(),
  status: statusSchema,
  payment: z
    .object({
      expenseId: z.number().int(),
      paidOn: z.string(),
      amountPaise: z.number().int(),
      lateFeePaise: z.number().int(),
    })
    .nullable(),
});

export const loanDto = z.object({
  id: z.number().int(),
  tractor: z.object({ id: z.number().int(), regNumber: z.string() }),
  lender: z.string(),
  emiPaise: z.number().int(),
  emiDay: z.number().int(),
  firstEmiMonth: z.string(),
  lastEmiMonth: z.string(),
  totalInstallments: z.number().int(),
  closedOn: z.string().nullable(),
  closedReason: z.enum(["PAID_OFF", "FORECLOSED"]).nullable(),
  notes: z.string().nullable(),
  /** Everything paid against the loan, instalments and foreclosure, late fees included. */
  paidPaise: z.number().int(),
  summary: z.object({
    paidCount: z.number().int(),
    overdueCount: z.number().int(),
    nextDue: z.object({ month: z.string(), dueDate: z.string() }).nullable(),
  }),
});
export type LoanDto = z.infer<typeof loanDto>;

export const loanDetailDto = loanDto.extend({
  schedule: z.array(instalmentDto),
  /** The payment that closed the loan early; undoing it opens the loan again. */
  foreclosure: z
    .object({ expenseId: z.number().int(), paidOn: z.string(), amountPaise: z.number().int() })
    .nullable(),
});
export type LoanDetail = z.infer<typeof loanDetailDto>;

export const loanPaymentSavedResponse = z.object({
  loan: loanDetailDto,
  expenseId: z.number().int(),
  warnings: z.array(z.string()),
});
export type LoanPaymentSaved = z.infer<typeof loanPaymentSavedResponse>;

export const emiDueResponse = z.object({
  asOf: z.string(),
  items: z.array(
    z.object({
      loan: z.object({ id: z.number().int(), lender: z.string() }),
      tractor: z.object({ id: z.number().int(), regNumber: z.string() }),
      month: z.string(),
      dueDate: z.string(),
      status: statusSchema,
      emiPaise: z.number().int(),
      /** Days past the due date; negative means that many days still to go. */
      daysLate: z.number().int(),
    }),
  ),
});
export type EmiDue = z.infer<typeof emiDueResponse>;
