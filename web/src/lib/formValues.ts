/** A text field as the API wants it on create: trimmed, or left out when empty. */
export function filled(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed === "" ? undefined : trimmed;
}

/**
 * A text field as the API wants it on edit: undefined when unchanged (so it is not sent), null
 * when cleared (so the old value is removed), otherwise the new value, trimmed.
 */
export function edited(before: string, after: string): string | null | undefined {
  const trimmed = after.trim();
  if (trimmed === before) return undefined;
  return trimmed === "" ? null : trimmed;
}
