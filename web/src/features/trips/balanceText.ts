import { formatRupees } from "../../lib/money.ts";

interface Balance {
  balancePaise: number;
  creditPaise: number;
}

/** "Ramesh now owes ₹22,000.": the customer's position after a save. */
export function balanceText(name: string, balance: Balance): string {
  if (balance.balancePaise > 0) return `${name} now owes ${formatRupees(balance.balancePaise)}.`;
  if (balance.creditPaise > 0)
    return `${name} now has ${formatRupees(balance.creditPaise)} credit.`;
  return `${name}'s account is settled.`;
}
