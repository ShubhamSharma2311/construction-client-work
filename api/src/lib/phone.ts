import { z } from "zod";

const INDIAN_MOBILE = /^(?:\+?91|0)?([6-9]\d{9})$/;

/** Accepts the ways a mobile number gets typed (+91, 0, spaces, dashes); stores 10 digits. */
export const phoneSchema = z.string().transform((value, ctx) => {
  const match = INDIAN_MOBILE.exec(value.replace(/[\s-]/g, ""));
  if (!match?.[1]) {
    ctx.addIssue({ code: "custom", message: "phone must be a 10-digit Indian mobile number" });
    return z.NEVER;
  }
  return match[1];
});

/**
 * The digits to search phones by, or null when the search holds too few digits to mean a
 * phone ("ram 1" must not match every number containing a 1). A leading +91 is dropped
 * because phones are stored as 10 digits.
 */
export function phoneSearchTerm(search: string): string | null {
  const digits = search.replace(/\D/g, "");
  const local =
    search.trim().startsWith("+91") || (digits.length === 12 && digits.startsWith("91"))
      ? digits.slice(2)
      : digits;
  return local.length >= 3 ? local : null;
}
