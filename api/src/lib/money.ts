import { z } from "zod";

/** ₹10,00,000 per entry, in paise. Anything larger is almost certainly a typo. */
export const MAX_ENTRY_PAISE = 100_000_000;

export type PaiseResult = { ok: true; paise: number } | { ok: false; reason: string };

const RUPEE_PATTERN = /^(-?)(\d+)(?:\.(\d+))?$/;
const MAX_RUPEE_DIGITS = 7;

/**
 * Converts a rupee amount typed by the owner into integer paise.
 * Numbers are read through their decimal string so float error never reaches storage.
 */
export interface PaiseRules {
  /** Opening balances may be zero; entries never are. */
  allowZero?: boolean;
}

export function toPaise(input: number | string, rules: PaiseRules = {}): PaiseResult {
  const text = typeof input === "number" ? String(input) : input.trim();
  const match = RUPEE_PATTERN.exec(text);
  if (!match) return { ok: false, reason: `"${text}" is not a valid amount` };

  const [, sign = "", whole = "", fraction = ""] = match;
  if (fraction.length > 2) return { ok: false, reason: "amount allows at most 2 decimal places" };

  const wholeDigits = whole.replace(/^0+(?=\d)/, "");
  if (wholeDigits.length > MAX_RUPEE_DIGITS) return overCap();

  const paise = Number(wholeDigits) * 100 + Number(fraction.padEnd(2, "0"));
  if (sign === "-" && paise > 0) return { ok: false, reason: "amount cannot be negative" };
  if (paise === 0 && !rules.allowZero) {
    return { ok: false, reason: "amount must be greater than zero" };
  }
  if (paise > MAX_ENTRY_PAISE) return overCap();
  return { ok: true, paise };
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
