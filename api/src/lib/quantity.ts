import { z } from "zod";
import { parseScaled } from "./decimal.ts";

/** One diesel fill cannot exceed this; a bigger number is a typo (e.g. rupees typed as litres). */
export const MAX_FILL_LITRES = 500;

const TOO_MUCH = `one fill cannot be more than ${String(MAX_FILL_LITRES)} litres`;

type LitresResult = { ok: true; ml: number } | { ok: false; problem: string };

function toMillilitres(input: number | string): LitresResult {
  const parsed = parseScaled(input, { maxDecimals: 2, scaleDigits: 3, maxWholeDigits: 4 });
  if (!parsed.ok) {
    if (parsed.problem === "decimals")
      return { ok: false, problem: "litres allow at most 2 decimal places" };
    if (parsed.problem === "too-large") return { ok: false, problem: TOO_MUCH };
    const typed = typeof input === "number" ? String(input) : input.trim();
    return { ok: false, problem: `"${typed}" is not a valid number of litres` };
  }
  if (parsed.negative || parsed.value === 0)
    return { ok: false, problem: "litres must be greater than zero" };
  if (parsed.value > MAX_FILL_LITRES * 1000) return { ok: false, problem: TOO_MUCH };
  return { ok: true, ml: parsed.value };
}

/** Litres as typed at the pump (up to 2 decimals), stored exactly as millilitres. */
export const litresSchema = z.union([z.number(), z.string()]).transform((value, ctx) => {
  const result = toMillilitres(value);
  if (result.ok) return result.ml;
  ctx.addIssue({ code: "custom", message: result.problem });
  return z.NEVER;
});
