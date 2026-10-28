import { z } from "zod";

/** Postgres INT is 32-bit; a larger id can never exist and must be a 400, not a 500. */
export const MAX_DB_ID = 2_147_483_647;

export const dbIdSchema = z.coerce.number().int().positive().max(MAX_DB_ID);

export const idParams = z.object({ id: dbIdSchema });

/** A PATCH body must change something. */
export function nonEmptyPatch<Shape extends z.ZodRawShape>(shape: Shape) {
  return z
    .object(shape)
    .refine((body) => Object.keys(body).length > 0, "send at least one field to change");
}
