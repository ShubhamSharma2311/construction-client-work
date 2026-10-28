import { z } from "zod";
import { dateRangeSchema } from "../../lib/dates.ts";

export const ledgerQuery = dateRangeSchema;
export type LedgerQuery = z.infer<typeof ledgerQuery>;

export const ledgerEntryDto = z.object({
  date: z.string(),
  type: z.enum(["OPENING_BALANCE", "TRIP", "PAYMENT", "WRITE_OFF"]),
  /** Trip id for TRIP and OPENING_BALANCE, payment id for PAYMENT and WRITE_OFF. */
  refId: z.number().int(),
  description: z.string(),
  debitPaise: z.number().int(),
  creditPaise: z.number().int(),
  /** Running balance after this line; positive means the customer owes. */
  balancePaise: z.number().int(),
});
export type LedgerEntry = z.infer<typeof ledgerEntryDto>;

export const ledgerResponse = z.object({
  customer: z.object({ id: z.number().int(), name: z.string(), phone: z.string().nullable() }),
  from: z.string().nullable(),
  to: z.string().nullable(),
  openingBalancePaise: z.number().int(),
  entries: z.array(ledgerEntryDto),
  totals: z.object({ debitPaise: z.number().int(), creditPaise: z.number().int() }),
  closingBalancePaise: z.number().int(),
});
export type Ledger = z.infer<typeof ledgerResponse>;

export const AGE_BUCKETS = ["0-7", "8-30", "31-90", "90+"] as const;
export const ageBucketSchema = z.enum(AGE_BUCKETS);
export type AgeBucket = z.infer<typeof ageBucketSchema>;

export const dueRowDto = z.object({
  customer: z.object({ id: z.number().int(), name: z.string(), phone: z.string().nullable() }),
  balancePaise: z.number().int(),
  duePaise: z.number().int(),
  creditPaise: z.number().int(),
  oldestDueDate: z.string(),
  ageDays: z.number().int(),
  bucket: ageBucketSchema,
  /** The customer has paid money not yet set against these dues; apply it. */
  hasUnappliedCredit: z.boolean(),
});
export type DueRow = z.infer<typeof dueRowDto>;

export const duesResponse = z.object({
  asOf: z.string(),
  customers: z.array(dueRowDto),
  totals: z.object({
    balancePaise: z.number().int(),
    byBucket: z.record(ageBucketSchema, z.number().int()),
  }),
});
export type Dues = z.infer<typeof duesResponse>;
