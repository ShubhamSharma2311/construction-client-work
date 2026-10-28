import { z } from "zod";
import { nonEmptyPatch } from "../../lib/request-schemas.ts";
import { phoneSchema } from "../../lib/phone.ts";
import { nameSchema, optionalText } from "../../lib/text.ts";

const fields = {
  name: nameSchema,
  phone: phoneSchema.nullable().optional(),
  village: optionalText(100),
  notes: optionalText(500),
};

export const customerCreateBody = z.object(fields);
export type CustomerCreateInput = z.infer<typeof customerCreateBody>;

export const customerUpdateBody = nonEmptyPatch({
  ...fields,
  name: nameSchema.optional(),
  isActive: z.boolean().optional(),
});
export type CustomerUpdateInput = z.infer<typeof customerUpdateBody>;

export const customerDto = z.object({
  id: z.number().int(),
  name: z.string(),
  phone: z.string().nullable(),
  village: z.string().nullable(),
  notes: z.string().nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
});
export type CustomerDto = z.infer<typeof customerDto>;

export const customerCreatedResponse = z.object({
  customer: customerDto,
  /** Existing customers with the same name; the owner may have meant one of them. */
  possibleDuplicates: z.array(customerDto),
});
export type CustomerCreated = z.infer<typeof customerCreatedResponse>;
