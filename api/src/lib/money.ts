import { z } from "zod";
import { parseScaled } from "./decimal.ts";

/** ₹10,00,000 per entry, in paise. Anything larger is almost certainly a typo. */
export const MAX_ENTRY_PAISE = 100_000_000;

export type PaiseResult = { ok: true; paise: number } | { ok: false; reason: string };

const MAX_RUPEE_DIGITS = 7;

export interface PaiseRules {
  /** Opening balances may be zero; entries never are. */
  allowZero?: boolean;
}

/** Converts a rupee amount typed by the owner into integer paise. */
export function toPaise(input: number | string, rules: PaiseRules = {}): PaiseResult {
  const parsed = parseScaled(input, {
    maxDecimals: 2,
    scaleDigits: 2,
    maxWholeDigits: MAX_RUPEE_DIGITS,
  });
  if (!parsed.ok) {
    if (parsed.problem === "decimals")
      return { ok: false, reason: "amount allows at most 2 decimal places" };
    if (parsed.problem === "too-large") return overCap();
    const text = typeof input === "number" ? String(input) : input.trim();
    return { ok: false, reason: `"${text}" is not a valid amount` };
  }
  if (parsed.negative) return { ok: false, reason: "amount cannot be negative" };
  if (parsed.value === 0 && !rules.allowZero) {
    return { ok: false, reason: "amount must be greater than zero" };
  }
  if (parsed.value > MAX_ENTRY_PAISE) return overCap();
  return { ok: true, paise: parsed.value };
}

function overCap(): PaiseResult {
  return { ok: false, reason: `amount cannot exceed ${formatPaise(MAX_ENTRY_PAISE)}` };
}

function rupeesField(rules: PaiseRules) {
  return z.union([z.number(), z.string()]).transform((value, ctx) => {
    const result = toPaise(value, rules);
    if (result.ok) return result.paise;
    ctx.addIssue({ code: "custom", message: result.reason });
    return z.NEVER;
  });
}

/** Zod field for a rupee amount in a request body; the parsed value is paise. */
export const rupeesSchema = rupeesField({});

/** Like `rupeesSchema` but zero is allowed (opening balances). */
export const rupeesOrZeroSchema = rupeesField({ allowZero: true });

export function paiseToRupeeString(paise: number): string {
  const sign = paise < 0 ? "-" : "";
  const abs = Math.abs(paise);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

const inr = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  minimumFractionDigits: 2,
});

export function formatPaise(paise: number): string {
  return inr.format(paise / 100);
}
