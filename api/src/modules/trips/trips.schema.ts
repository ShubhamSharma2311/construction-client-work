import { z } from "zod";
import { dateRangeSchema, isoDateSchema } from "../../lib/dates.ts";
import { rupeesSchema } from "../../lib/money.ts";
import { paginationSchema } from "../../lib/pagination.ts";
import { dbIdSchema, nonEmptyPatch } from "../../lib/request-schemas.ts";
import { optionalText } from "../../lib/text.ts";
import { customerBalanceDto } from "../customer-ledger/balance.ts";

export const payModeSchema = z.enum(["CASH", "ONLINE"]);
export type PayMode = z.infer<typeof payModeSchema>;

const referenceSchema = z.string().trim().min(1).max(100).optional();

/** How the customer paid when the trip was delivered. */
export const tripPaymentSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("DUE") }).strict(),
  z.object({ type: z.literal("CASH") }).strict(),
  z.object({ type: z.literal("ONLINE"), reference: referenceSchema }).strict(),
  z
    .object({
      type: z.literal("PARTIAL"),
      paidAmount: rupeesSchema,
      mode: payModeSchema,
      reference: referenceSchema,
    })
    .strict(),
]);
export type TripPaymentInput = z.infer<typeof tripPaymentSchema>;

export const tripCreateBody = z.object({
  tripDate: isoDateSchema,
  customerId: dbIdSchema,
  driverId: dbIdSchema,
  tractorId: dbIdSchema,
  khetId: dbIdSchema,
  amount: rupeesSchema,
  quantityNote: optionalText(50),
  notes: optionalText(500),
  payment: tripPaymentSchema,
});
export type TripCreateInput = z.infer<typeof tripCreateBody>;

export const tripUpdateBody = nonEmptyPatch({
  tripDate: isoDateSchema.optional(),
  customerId: dbIdSchema.optional(),
  driverId: dbIdSchema.optional(),
  tractorId: dbIdSchema.optional(),
  khetId: dbIdSchema.optional(),
  amount: rupeesSchema.optional(),
  quantityNote: optionalText(50),
  notes: optionalText(500),
});
export type TripUpdateInput = z.infer<typeof tripUpdateBody>;

export const tripStatusSchema = z.enum(["PAID", "PARTIAL", "DUE"]);
export type TripStatus = z.infer<typeof tripStatusSchema>;

const tripFilterFields = {
  customerId: dbIdSchema.optional(),
  driverId: dbIdSchema.optional(),
  tractorId: dbIdSchema.optional(),
  khetId: dbIdSchema.optional(),
  status: tripStatusSchema.optional(),
  kind: z.enum(["TRIP", "OPENING_BALANCE"]).optional(),
  deleted: z.enum(["true", "false"]).default("false"),
};

export const tripFilterQuery = dateRangeSchema.and(z.object(tripFilterFields));
export type TripFilter = z.infer<typeof tripFilterQuery>;

export const tripListQuery = tripFilterQuery.and(paginationSchema);
export type TripListQuery = z.infer<typeof tripListQuery>;

export const tripDeleteQuery = z.object({
  releasePayments: z.enum(["true", "false"]).default("false"),
});

const ref = z.object({ id: z.number().int(), name: z.string() });

export const tripDto = z.object({
  id: z.number().int(),
  kind: z.enum(["TRIP", "OPENING_BALANCE"]),
  tripDate: z.string(),
  customer: ref,
  driver: ref.nullable(),
  tractor: z.object({ id: z.number().int(), regNumber: z.string() }).nullable(),
  khet: ref.nullable(),
  amountPaise: z.number().int(),
  receivedPaise: z.number().int(),
  duePaise: z.number().int(),
  status: tripStatusSchema,
  quantityNote: z.string().nullable(),
  notes: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type TripDto = z.infer<typeof tripDto>;

export const tripSavedResponse = z.object({
  trip: tripDto,
  customerBalance: customerBalanceDto,
  warnings: z.array(z.string()),
});
export type TripSaved = z.infer<typeof tripSavedResponse>;

export const tripDeletedResponse = z.object({
  trip: tripDto,
  releasedPaise: z.number().int(),
  customerBalance: customerBalanceDto,
});
export type TripDeleted = z.infer<typeof tripDeletedResponse>;

export const tripTotalsDto = z.object({
  count: z.number().int(),
  amountPaise: z.number().int(),
  receivedPaise: z.number().int(),
  duePaise: z.number().int(),
});

export const tripPageResponse = z.object({
  items: z.array(tripDto),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totals: tripTotalsDto,
});
export type TripPage = z.infer<typeof tripPageResponse>;

export const openingBalanceBody = z.object({ amount: rupeesSchema, notes: optionalText(500) });
export type OpeningBalanceInput = z.infer<typeof openingBalanceBody>;
