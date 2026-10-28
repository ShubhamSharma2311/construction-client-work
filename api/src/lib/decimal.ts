const DECIMAL = /^(-?)(\d+)(?:\.(\d+))?$/;

export interface ScaledRules {
  /** Decimal places the owner may type (2 for rupees and litres). */
  maxDecimals: number;
  /** Digits the stored integer keeps after the point (2 for paise, 3 for millilitres). */
  scaleDigits: number;
  /** Whole-number digits allowed before the value is treated as a typo. */
  maxWholeDigits: number;
}

export type ScaledResult =
  | { ok: true; value: number; negative: boolean }
  | { ok: false; problem: "format" | "decimals" | "too-large" };

/**
 * Reads a typed decimal into an exact integer of the given scale. Numbers go through their
 * decimal string, so binary float error (0.1 + 0.2) never reaches storage.
 */
export function parseScaled(input: number | string, rules: ScaledRules): ScaledResult {
  if (rules.maxDecimals > rules.scaleDigits) {
    throw new Error("parseScaled cannot keep more decimals than its scale stores");
  }
  const text = typeof input === "number" ? String(input) : input.trim();
  const match = DECIMAL.exec(text);
  if (!match) return { ok: false, problem: "format" };
  const [, sign = "", whole = "", fraction = ""] = match;
  if (fraction.length > rules.maxDecimals) return { ok: false, problem: "decimals" };
  const wholeDigits = whole.replace(/^0+(?=\d)/, "");
  if (wholeDigits.length > rules.maxWholeDigits) return { ok: false, problem: "too-large" };
  const value =
    Number(wholeDigits) * 10 ** rules.scaleDigits + Number(fraction.padEnd(rules.scaleDigits, "0"));
  return { ok: true, value, negative: sign === "-" && value > 0 };
}
