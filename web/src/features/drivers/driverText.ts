import { formatMonth } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import { PAY_MODE_LABELS } from "../../lib/payModes.ts";
import type { DriverLedger } from "./useDriver.ts";

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

type LedgerLine = Pick<DriverLedger["entries"][number], "type" | "month" | "note" | "mode">;

/** One line of a driver's account in words: "Salary for Sept 2026", "Advance, cash: tyre". */
export function entryText(line: LedgerLine): string {
  const how = line.mode ? `, ${PAY_MODE_LABELS[line.mode].toLowerCase()}` : "";
  const note = line.note ? `: ${line.note}` : "";
  const forMonth = line.month ? ` for ${formatMonth(line.month)}` : "";
  switch (line.type) {
    case "OPENING_BALANCE":
      return `Balance from the old register${note}`;
    case "EARNED_SALARY":
      return `Salary${forMonth}${line.note ? ` (${line.note})` : ""}`;
    case "EARNED_BONUS":
      return `Bonus earned${note}`;
    case "PAID_ADVANCE":
      return `Advance${how}${note}`;
    case "PAID_SALARY":
      return `Salary paid${forMonth}${how}${note}`;
    case "PAID_BONUS":
      return `Bonus paid${how}${note}`;
  }
}

/** "+₹15,000" when the line adds to what the driver is owed, "−₹5,000" when it takes away. */
export function entryChange(earnedPaise: number, paidPaise: number): string {
  const change = earnedPaise - paidPaise;
  return `${change > 0 ? "+" : ""}${formatRupees(change)}`;
}
