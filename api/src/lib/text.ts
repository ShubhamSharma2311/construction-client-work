import { z } from "zod";

function collapseSpaces(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

/** A person, place or label name: trimmed, inner spaces collapsed, 1-100 characters. */
export const nameSchema = z
  .string()
  .transform(collapseSpaces)
  .pipe(z.string().min(1, "name is required").max(100));

/** Search and duplicate key: "  Ram  Lal " and "ram lal" are the same name. */
export function nameKey(name: string): string {
  return collapseSpaces(name).toLowerCase();
}

/** Free text that may be left blank; blank is stored as null. */
export function optionalText(max: number) {
  return z
    .string()
    .transform(collapseSpaces)
    .pipe(z.string().max(max))
    .transform((value) => (value === "" ? null : value))
    .nullable()
    .optional();
}
