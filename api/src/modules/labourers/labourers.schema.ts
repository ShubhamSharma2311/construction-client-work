import { z } from "zod";
import { nonEmptyPatch } from "../../lib/request-schemas.ts";
import { phoneSchema } from "../../lib/phone.ts";
import { nameSchema, optionalText } from "../../lib/text.ts";

export const labourerCreateBody = z.object({
  name: nameSchema,
  phone: phoneSchema.nullable().optional(),
  notes: optionalText(500),
});
export type LabourerCreateInput = z.infer<typeof labourerCreateBody>;

export const labourerUpdateBody = nonEmptyPatch({
  name: nameSchema.optional(),
  phone: phoneSchema.nullable().optional(),
  notes: optionalText(500),
  isActive: z.boolean().optional(),
});
export type LabourerUpdateInput = z.infer<typeof labourerUpdateBody>;

export const labourerDto = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
});
export type LabourerDto = z.infer<typeof labourerDto>;
