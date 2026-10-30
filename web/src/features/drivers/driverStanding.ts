import { formatRupees } from "../../lib/money.ts";

/**
 * A driver's account in plain words. The balance is earned minus paid: above zero the
 * business owes the driver; below zero the driver has taken more than earned (an advance).
 */
export function driverStanding(
  name: string,
  balancePaise: number,
): { text: string; owesDriver: boolean | null } {
  if (balancePaise > 0)
    return { text: `You owe ${name} ${formatRupees(balancePaise)}`, owesDriver: true };
  if (balancePaise < 0) {
    return { text: `${name} has ${formatRupees(-balancePaise)} in advance`, owesDriver: false };
  }
  return { text: `${name}'s account is settled`, owesDriver: null };
}
