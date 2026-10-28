import { z } from "zod";
import { nonEmptyPatch } from "../../lib/request-schemas.ts";
import { nameSchema } from "../../lib/text.ts";

/** "rj 19 ab-1234" and "RJ19AB1234" are the same tractor. */
export const regNumberSchema = z
  .string()
  .transform((value) => value.toUpperCase().replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^[A-Z0-9]{4,12}$/, "registration number must be 4-12 letters/digits"));

export const tractorCreateBody = z.object({ regNumber: regNumberSchema, label: nameSchema });
export type TractorCreateInput = z.infer<typeof tractorCreateBody>;

export const tractorUpdateBody = nonEmptyPatch({
  regNumber: regNumberSchema.optional(),
  label: nameSchema.optional(),
  isActive: z.boolean().optional(),
});
export type TractorUpdateInput = z.infer<typeof tractorUpdateBody>;

export const tractorDto = z.object({
  id: z.number().int(),
  regNumber: z.string(),
  label: z.string(),
  isActive: z.boolean(),
  defaultDriver: z.object({ id: z.number().int(), name: z.string() }).nullable(),
});
export type TractorDto = z.infer<typeof tractorDto>;

export const tractorUpdatedResponse = z.object({
  tractor: tractorDto,
  warnings: z.array(z.string()),
});
export type TractorUpdated = z.infer<typeof tractorUpdatedResponse>;
