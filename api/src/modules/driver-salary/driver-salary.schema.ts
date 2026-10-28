import { z } from "zod";
import { dateRangeSchema, isoDateSchema, isoMonthSchema } from "../../lib/dates.ts";
import { rupeesOrZeroSchema, rupeesSchema, signedRupeesSchema } from "../../lib/money.ts";
import { paginationSchema } from "../../lib/pagination.ts";
import { dbIdSchema } from "../../lib/request-schemas.ts";
import { optionalText } from "../../lib/text.ts";
import { payModeSchema } from "../trips/trips.schema.ts";

export const monthQuery = z.object({ month: isoMonthSchema });

export const monthParams = z.object({ id: dbIdSchema, month: isoMonthSchema });

export const closeMonthBody = z
  .object({
    month: isoMonthSchema,
    /** Leave out to use the rate, prorated by days worked. A different amount needs a note. */
    amount: rupeesOrZeroSchema.optional(),
    note: optionalText(500),
  })
  .strict();
export type CloseMonthInput = z.infer<typeof closeMonthBody>;

export const driverPaymentBody = z
  .object({
    type: z.enum(["ADVANCE", "SALARY"]),
    paidOn: isoDateSchema,
    amount: rupeesSchema,
    mode: payModeSchema,
    forMonth: isoMonthSchema.optional(),
    notes: optionalText(500),
  })
  .strict();
export type DriverPaymentInput = z.infer<typeof driverPaymentBody>;

export const bonusBody = z
  .object({
    paidOn: isoDateSchema,
    amount: rupeesSchema,
    mode: payModeSchema,
    note: z.string().trim().min(1, "say what the bonus is for").max(500),
  })
  .strict();
export type BonusInput = z.infer<typeof bonusBody>;

export const driverOpeningBody = z
  .object({
    /** Positive: the owner owed the driver. Negative: the driver held an advance. */
    amount: signedRupeesSchema,
    note: optionalText(500),
  })
  .strict();
export type DriverOpeningInput = z.infer<typeof driverOpeningBody>;

export const driverPaymentFilterQuery = dateRangeSchema.and(
  z.object({
    driverId: dbIdSchema.optional(),
    type: z.enum(["ADVANCE", "SALARY", "BONUS"]).optional(),
    mode: payModeSchema.optional(),
    deleted: z.enum(["true", "false"]).default("false"),
  }),
);
export type DriverPaymentFilter = z.infer<typeof driverPaymentFilterQuery>;

export const driverPaymentListQuery = driverPaymentFilterQuery.and(paginationSchema);
export type DriverPaymentListQuery = z.infer<typeof driverPaymentListQuery>;

export const accrualDto = z.object({
  id: z.number().int(),
  kind: z.enum(["MONTH_SALARY", "BONUS", "OPENING_BALANCE"]),
  month: z.string().nullable(),
  accruedOn: z.string(),
  amountPaise: z.number().int(),
  note: z.string().nullable(),
});
export type AccrualDto = z.infer<typeof accrualDto>;

export const driverPaymentDto = z.object({
  id: z.number().int(),
  driver: z.object({ id: z.number().int(), name: z.string() }),
  paidOn: z.string(),
  type: z.enum(["ADVANCE", "SALARY", "BONUS"]),
  amountPaise: z.number().int(),
  mode: payModeSchema,
  forMonth: z.string().nullable(),
  notes: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type DriverPaymentDto = z.infer<typeof driverPaymentDto>;

/** Positive: the owner owes the driver. Negative: the driver holds unadjusted advance. */
const balancePaise = z.number().int();

export const salaryPreviewResponse = z.object({
  month: z.string(),
  monthlyPaise: z.number().int().nullable(),
  daysInMonth: z.number().int(),
  daysWorked: z.number().int(),
  suggestedPaise: z.number().int().nullable(),
  closed: accrualDto.nullable(),
});
export type SalaryPreview = z.infer<typeof salaryPreviewResponse>;

export const accrualSavedResponse = z.object({ accrual: accrualDto, balancePaise });
export type AccrualSaved = z.infer<typeof accrualSavedResponse>;

export const driverPaymentSavedResponse = z.object({ payment: driverPaymentDto, balancePaise });
export type DriverPaymentSaved = z.infer<typeof driverPaymentSavedResponse>;

export const driverLedgerResponse = z.object({
  driver: z.object({ id: z.number().int(), name: z.string() }),
  from: z.string().nullable(),
  to: z.string().nullable(),
  openingBalancePaise: balancePaise,
  entries: z.array(
    z.object({
      date: z.string(),
      type: z.enum([
        "OPENING_BALANCE",
        "EARNED_SALARY",
        "EARNED_BONUS",
        "PAID_ADVANCE",
        "PAID_SALARY",
        "PAID_BONUS",
      ]),
      refId: z.number().int(),
      description: z.string(),
      earnedPaise: z.number().int(),
      paidPaise: z.number().int(),
      balancePaise,
    }),
  ),
  months: z.array(
    z.object({
      month: z.string(),
      earnedPaise: z.number().int(),
      paidPaise: z.number().int(),
      closingBalancePaise: balancePaise,
    }),
  ),
  closingBalancePaise: balancePaise,
});
export type DriverLedger = z.infer<typeof driverLedgerResponse>;

export const driverPaymentPageResponse = z.object({
  items: z.array(driverPaymentDto),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totals: z.object({
    advancePaise: z.number().int(),
    salaryPaise: z.number().int(),
    bonusPaise: z.number().int(),
  }),
});
export type DriverPaymentPage = z.infer<typeof driverPaymentPageResponse>;
