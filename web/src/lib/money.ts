const grouping = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * "₹1,23,456" from paise, in Indian digit grouping. Paise show only when there are any,
 * because almost every amount in this business is whole rupees.
 */
export function formatRupees(paise: number, { symbol = true }: { symbol?: boolean } = {}): string {
  const sign = paise < 0 ? "−" : "";
  const whole = Math.abs(paise);
  const rupees = grouping.format(Math.floor(whole / 100));
  const rest = whole % 100;
  return `${sign}${symbol ? "₹" : ""}${rupees}${rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`}`;
}

// Up to ₹99,99,999 with at most two paise digits; the API caps one entry at ₹10,00,000
// and words that refusal itself, so the field only blocks what can never be an amount.
const RUPEE_INPUT = /^\d{0,7}(\.\d{0,2})?$/;

/** Drops what people paste along with an amount: "₹ 1,000" becomes "1000". */
export function cleanRupeeInput(text: string): string {
  return text.replace(/[₹,\s]/g, "");
}

/** Whether text typed into an amount field can still become a valid amount. */
export function isRupeeInput(text: string): boolean {
  return RUPEE_INPUT.test(text);
}

/** Paise from an amount as typed ("3500", "3500.5"), or null when it is not one yet. */
export function rupeesToPaise(text: string): number | null {
  const match = /^(\d{1,7})(?:\.(\d{0,2}))?$/.exec(text);
  if (!match) return null;
  // Whole-number maths: 0.1 + 0.2 style float errors have no place in a ledger.
  return Number(match[1]) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
}

/** Paise as an amount the API takes and a field shows: 150050 is "1500.50", 150000 is "1500". */
export function paiseToRupeeInput(paise: number): string {
  const rest = paise % 100;
  return `${String(Math.floor(paise / 100))}${rest === 0 ? "" : `.${String(rest).padStart(2, "0")}`}`;
}
