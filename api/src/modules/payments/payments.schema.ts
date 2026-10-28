import { z } from "zod";
import { dateRangeSchema, isoDateSchema } from "../../lib/dates.ts";
import { rupeesSchema } from "../../lib/money.ts";
import { paginationSchema } from "../../lib/pagination.ts";
import { dbIdSchema, nonEmptyPatch } from "../../lib/request-schemas.ts";
import { optionalText } from "../../lib/text.ts";
import { customerBalanceDto } from "../customer-ledger/balance.ts";
import { payModeSchema } from "../trips/trips.schema.ts";

export const allocationSchema = z
  .discriminatedUnion("strategy", [
    z.object({ strategy: z.literal("AUTO") }).strict(),
    z
      .object({
        strategy: z.literal("MANUAL"),
        items: z
          .array(z.object({ tripId: dbIdSchema, amount: rupeesSchema }))
          .min(1)
          .max(200),
      })
      .strict(),
  ])
  .default({ strategy: "AUTO" });
export type AllocationInput = z.infer<typeof allocationSchema>;

const reference = z.string().trim().min(1).max(100);

/** Money received from a customer, or an amount forgiven at settlement (write-off). */
export const paymentCreateBody = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("PAYMENT"),
      paidOn: isoDateSchema,
      amount: rupeesSchema,
      mode: payModeSchema,
      reference: reference.optional(),
      notes: optionalText(500),
      allocation: allocationSchema,
    })
    .strict(),
  z
    .object({
      kind: z.literal("WRITE_OFF"),
      paidOn: isoDateSchema,
      amount: rupeesSchema,
      notes: optionalText(500),
      allocation: allocationSchema,
    })
    .strict(),
]);
export type PaymentCreateInput = z.infer<typeof paymentCreateBody>;

export const paymentUpdateBody = nonEmptyPatch({
  paidOn: isoDateSchema.optional(),
  mode: payModeSchema.optional(),
  reference: reference.nullable().optional(),
  notes: optionalText(500),
});
export type PaymentUpdateInput = z.infer<typeof paymentUpdateBody>;

export const paymentFilterQuery = dateRangeSchema.and(
  z.object({
    customerId: dbIdSchema.optional(),
    kind: z.enum(["PAYMENT", "WRITE_OFF"]).optional(),
    mode: payModeSchema.optional(),
    deleted: z.enum(["true", "false"]).default("false"),
  }),
);
export type PaymentFilter = z.infer<typeof paymentFilterQuery>;

export const paymentListQuery = paymentFilterQuery.and(paginationSchema);
export type PaymentListQuery = z.infer<typeof paymentListQuery>;

const allocationLineDto = z.object({
  tripId: z.number().int(),
  tripDate: z.string(),
  tripKind: z.enum(["TRIP", "OPENING_BALANCE"]),
  amountPaise: z.number().int(),
});
export type AllocationLineDto = z.infer<typeof allocationLineDto>;

export const paymentDto = z.object({
  id: z.number().int(),
  customer: z.object({ id: z.number().int(), name: z.string() }),
  paidOn: z.string(),
  kind: z.enum(["PAYMENT", "WRITE_OFF"]),
  mode: payModeSchema.nullable(),
  amountPaise: z.number().int(),
  allocatedPaise: z.number().int(),
  /** Part of this payment not yet set against a trip: the customer's credit. */
  unallocatedPaise: z.number().int(),
  reference: z.string().nullable(),
  notes: z.string().nullable(),
  /** Set when the money was taken at a trip's delivery. */
  deliveryTripId: z.number().int().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
  allocations: z.array(allocationLineDto),
});
export type PaymentDto = z.infer<typeof paymentDto>;

export const paymentSavedResponse = z.object({
  payment: paymentDto,
  customerBalance: customerBalanceDto,
});
export type PaymentSaved = z.infer<typeof paymentSavedResponse>;

export const creditAppliedResponse = z.object({
  allocations: z.array(
    z.object({
      paymentId: z.number().int(),
      tripId: z.number().int(),
      amountPaise: z.number().int(),
    }),
  ),
  customerBalance: customerBalanceDto,
});
export type CreditApplied = z.infer<typeof creditAppliedResponse>;

export const paymentPageResponse = z.object({
  items: z.array(paymentDto),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totals: z.object({
    cashPaise: z.number().int(),
    onlinePaise: z.number().int(),
    writeOffPaise: z.number().int(),
  }),
});
export type PaymentPage = z.infer<typeof paymentPageResponse>;
