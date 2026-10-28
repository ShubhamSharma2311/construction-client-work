import { z } from "zod";
import { AppError } from "./errors.ts";

/** Parses input outside a route schema (CLI, service-level rules) into a typed value or a 400. */
export function parseOrThrow<Schema extends z.ZodType>(
  schema: Schema,
  value: unknown,
): z.output<Schema> {
  const result = schema.safeParse(value);
  if (!result.success) throw new AppError("VALIDATION", z.prettifyError(result.error));
  return result.data;
}
