import { z } from "zod";
import { nonEmptyPatch } from "../../lib/request-schemas.ts";
import { nameSchema, optionalText } from "../../lib/text.ts";

/** Percent with up to 2 decimals, e.g. 33.33; stored as basis points. */
const sharePercentSchema = z
  .number()
  .min(0)
  .max(100)
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: "share percent allows at most 2 decimal places",
  });

export const partnerCreateBody = z.object({
  name: nameSchema,
  sharePercent: sharePercentSchema.nullable().optional(),
  notes: optionalText(500),
});
export type PartnerCreateInput = z.infer<typeof partnerCreateBody>;

export const partnerUpdateBody = nonEmptyPatch({
  name: nameSchema.optional(),
  sharePercent: sharePercentSchema.nullable().optional(),
  notes: optionalText(500),
  isActive: z.boolean().optional(),
});
export type PartnerUpdateInput = z.infer<typeof partnerUpdateBody>;

export const partnerDto = z.object({
  id: z.number().int(),
  name: z.string(),
  sharePercent: z.number().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
});
export type PartnerDto = z.infer<typeof partnerDto>;
