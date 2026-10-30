import { formatRupees } from "../../lib/money.ts";

/**
 * What the share comes to. Below zero the partner owes the business: either he was paid more
 * than his share, or the dates made a loss and this is his part of it. Both read the same way.
 */
export function shareStanding(name: string, balancePaise: number): string {
  if (balancePaise > 0) return `${formatRupees(balancePaise)} of ${name}'s share is still to pay`;
  if (balancePaise < 0) return `${name} owes ${formatRupees(-balancePaise)} back to the business`;
  return `${name}'s share is paid exactly`;
}

/**
 * Money paid out to the partner, net of money received back. A save reports the net over every
 * entry, which differs from the dates on screen, so it says "In all".
 */
export function netPaidText(
  name: string,
  netPaidPaise: number,
  { inAll = false }: { inAll?: boolean } = {},
): string {
  const way = netPaidPaise >= 0 ? `paid to ${name}` : `received from ${name}`;
  const text = `${way}, net: ${formatRupees(Math.abs(netPaidPaise))}`;
  return inAll ? `In all, ${text}` : text.charAt(0).toUpperCase() + text.slice(1);
}
