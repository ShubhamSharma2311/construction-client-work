import { z } from "zod";
import { dateRangeSchema, isoDateSchema } from "../../lib/dates.ts";
import { rupeesSchema } from "../../lib/money.ts";
import { paginationSchema } from "../../lib/pagination.ts";
import { dbIdSchema, nonEmptyPatch } from "../../lib/request-schemas.ts";
import { optionalText } from "../../lib/text.ts";
import { payModeSchema } from "../trips/trips.schema.ts";

export const partnerTxnDirectionSchema = z.enum(["PAID_TO_PARTNER", "RECEIVED_FROM_PARTNER"]);

export const partnerTxnBody = z
  .object({
    direction: partnerTxnDirectionSchema,
    txnDate: isoDateSchema,
    amount: rupeesSchema,
    mode: payModeSchema,
    notes: optionalText(500),
  })
  .strict();
export type PartnerTxnInput = z.infer<typeof partnerTxnBody>;

export const partnerTxnUpdateBody = nonEmptyPatch({
  direction: partnerTxnDirectionSchema.optional(),
  txnDate: isoDateSchema.optional(),
  amount: rupeesSchema.optional(),
  mode: payModeSchema.optional(),
  notes: optionalText(500),
});
export type PartnerTxnUpdateInput = z.infer<typeof partnerTxnUpdateBody>;

export const partnerTxnFilterQuery = dateRangeSchema.and(
  z.object({
    partnerId: dbIdSchema.optional(),
    direction: partnerTxnDirectionSchema.optional(),
    mode: payModeSchema.optional(),
    deleted: z.enum(["true", "false"]).default("false"),
  }),
);
export type PartnerTxnFilter = z.infer<typeof partnerTxnFilterQuery>;

export const partnerTxnListQuery = partnerTxnFilterQuery.and(paginationSchema);
export type PartnerTxnListQuery = z.infer<typeof partnerTxnListQuery>;

export const partnerTxnDto = z.object({
  id: z.number().int(),
  partner: z.object({ id: z.number().int(), name: z.string() }),
  txnDate: z.string(),
  direction: partnerTxnDirectionSchema,
  amountPaise: z.number().int(),
  mode: payModeSchema,
  notes: z.string().nullable(),
  deletedAt: z.string().nullable(),
  createdAt: z.string(),
});
export type PartnerTxnDto = z.infer<typeof partnerTxnDto>;

/** Net paid to the partner: paid out minus received back. */
const netPaidPaise = z.number().int();

export const partnerTxnSavedResponse = z.object({ txn: partnerTxnDto, netPaidPaise });
export type PartnerTxnSaved = z.infer<typeof partnerTxnSavedResponse>;

const directionTotals = z.object({
  paidToPartnerPaise: z.number().int(),
  receivedFromPartnerPaise: z.number().int(),
  netPaidPaise,
});

export const partnerLedgerResponse = z.object({
  partner: z.object({ id: z.number().int(), name: z.string() }),
  from: z.string().nullable(),
  to: z.string().nullable(),
  openingNetPaidPaise: netPaidPaise,
  entries: z.array(
    z.object({
      date: z.string(),
      direction: partnerTxnDirectionSchema,
      refId: z.number().int(),
      amountPaise: z.number().int(),
      mode: payModeSchema,
      notes: z.string().nullable(),
      netPaidPaise,
    }),
  ),
  totals: directionTotals,
  closingNetPaidPaise: netPaidPaise,
});
export type PartnerLedger = z.infer<typeof partnerLedgerResponse>;

export const partnerTxnPageResponse = z.object({
  items: z.array(partnerTxnDto),
  total: z.number().int(),
  page: z.number().int(),
  limit: z.number().int(),
  totals: directionTotals,
});
export type PartnerTxnPage = z.infer<typeof partnerTxnPageResponse>;
