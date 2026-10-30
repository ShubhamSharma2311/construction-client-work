import { formatRupees } from "../../lib/money.ts";

/** What the share comes to: still owed to the partner, paid more than the share, or square. */
export function shareStanding(name: string, balancePaise: number): string {
  if (balancePaise > 0) return `${formatRupees(balancePaise)} of ${name}'s share is still to pay`;
  if (balancePaise < 0)
    return `${name} has been paid ${formatRupees(-balancePaise)} more than the share`;
  return `${name}'s share is paid exactly`;
}

/** Money paid out to the partner, net of money received back. */
export function netPaidText(name: string, netPaidPaise: number): string {
  if (netPaidPaise >= 0) return `Paid to ${name}, net: ${formatRupees(netPaidPaise)}`;
  return `Received from ${name}, net: ${formatRupees(-netPaidPaise)}`;
}
