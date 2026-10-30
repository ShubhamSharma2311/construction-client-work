import type { CustomerBalance } from "./useCustomers.ts";

export type Standing =
  { kind: "owes"; paise: number } | { kind: "credit"; paise: number } | { kind: "settled" };

/** Where a customer stands overall: a negative balance is money held for them as credit. */
export function standingOf(balance: CustomerBalance): Standing {
  if (balance.balancePaise > 0) return { kind: "owes", paise: balance.balancePaise };
  if (balance.balancePaise < 0) return { kind: "credit", paise: -balance.balancePaise };
  return { kind: "settled" };
}

/** Credit can be set against dues only when there is some of each. */
export function canUseCredit(balance: CustomerBalance): boolean {
  return balance.creditPaise > 0 && balance.duePaise > 0;
}
