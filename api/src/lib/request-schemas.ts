import { z } from "zod";

/** Ids count up from 1 and never near 2^31; a larger one is a typo, so a 400, not a 500. */
export const MAX_DB_ID = 2_147_483_647;

export const dbIdSchema = z.coerce.number().int().positive().max(MAX_DB_ID);

export const idParams = z.object({ id: dbIdSchema });

/** A PATCH body must change something, and an unknown field is an error, not ignored. */
export function nonEmptyPatch<Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .strictObject(shape)
    .refine((body) => Object.keys(body).length > 0, "send at least one field to change");
}
