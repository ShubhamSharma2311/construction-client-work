import { z } from "zod";
import { nonEmptyPatch } from "../../lib/request-schemas.ts";
import { nameSchema, optionalText } from "../../lib/text.ts";

export const khetCreateBody = z.object({ name: nameSchema, location: optionalText(200) });
export type KhetCreateInput = z.infer<typeof khetCreateBody>;

export const khetUpdateBody = nonEmptyPatch({
  name: nameSchema.optional(),
  location: optionalText(200),
  isActive: z.boolean().optional(),
});
export type KhetUpdateInput = z.infer<typeof khetUpdateBody>;

export const khetDto = z.object({
  id: z.number().int(),
  name: z.string(),
  location: z.string().nullable(),
  isActive: z.boolean(),
});
export type KhetDto = z.infer<typeof khetDto>;
