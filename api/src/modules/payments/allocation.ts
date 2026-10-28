import { AppError } from "../../lib/errors.ts";
import { formatPaise } from "../../lib/money.ts";

export interface DueTrip {
  tripId: number;
  duePaise: number;
}

export interface AllocationLine {
  tripId: number;
  amountPaise: number;
}

/**
 * Settles the oldest dues first. `dues` must already be oldest first (opening balance,
 * then by date). Whatever is left over stays unallocated as customer credit.
 */
export function planFifo(dues: readonly DueTrip[], amountPaise: number): AllocationLine[] {
  const lines: AllocationLine[] = [];
  let left = amountPaise;
  for (const due of dues) {
    if (left === 0) break;
    const take = Math.min(left, due.duePaise);
    if (take > 0) lines.push({ tripId: due.tripId, amountPaise: take });
    left -= take;
  }
  return lines;
}

/** Checks an allocation the owner chose by hand against what each trip still owes. */
export function checkManualPlan(
  dues: ReadonlyMap<number, number>,
  lines: readonly AllocationLine[],
  amountPaise: number,
): void {
  const seen = new Set<number>();
  let total = 0;
  for (const line of lines) {
    if (seen.has(line.tripId)) {
      throw new AppError(
        "VALIDATION",
        `Trip #${String(line.tripId)} appears twice in the allocation`,
      );
    }
    seen.add(line.tripId);
    const due = dues.get(line.tripId);
    if (due === undefined) {
      throw new AppError(
        "CONFLICT",
        `Trip #${String(line.tripId)} is not an open trip of this customer`,
        { tripId: line.tripId },
      );
    }
    if (line.amountPaise > due) {
      throw new AppError(
        "CONFLICT",
        `Trip #${String(line.tripId)} only has ${formatPaise(due)} due`,
        { tripId: line.tripId, duePaise: due },
      );
    }
    total += line.amountPaise;
  }
  if (total > amountPaise) {
    throw new AppError(
      "VALIDATION",
      `The allocation adds up to ${formatPaise(total)}, more than the payment of ${formatPaise(amountPaise)}`,
    );
  }
}

export function sumLines(lines: readonly AllocationLine[]): number {
  return lines.reduce((total, line) => total + line.amountPaise, 0);
}
