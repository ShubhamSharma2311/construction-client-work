import { toDbDate, fromDbDate, type IsoDate } from "../../lib/dates.ts";
import type { Tx } from "../../lib/prisma.ts";

export interface HourMeterReading {
  tractorId: number;
  hourMeter: number;
  spentOn: IsoDate;
}

/**
 * A tractor's hour meter only goes up. A reading below one from an earlier day, or above
 * one from a later day, is usually a typo (allowed, but flagged). Readings on the same day
 * have no order, so they are not compared.
 */
export async function hourMeterWarnings(
  tx: Tx,
  reading: HourMeterReading,
  excludeId?: number,
): Promise<string[]> {
  const day = toDbDate(reading.spentOn);
  const others = {
    category: "TRACTOR_SERVICE" as const,
    tractorId: reading.tractorId,
    deletedAt: null,
    hourMeter: { not: null },
    id: excludeId === undefined ? undefined : { not: excludeId },
  };
  const [earlierHigher, laterLower] = await Promise.all([
    tx.expense.findFirst({
      where: { ...others, spentOn: { lt: day }, hourMeter: { gt: reading.hourMeter } },
      orderBy: { hourMeter: "desc" },
    }),
    tx.expense.findFirst({
      where: { ...others, spentOn: { gt: day }, hourMeter: { lt: reading.hourMeter } },
      orderBy: { hourMeter: "asc" },
    }),
  ]);
  const warnings: string[] = [];
  if (earlierHigher?.hourMeter != null) {
    warnings.push(
      `Hour meter ${String(reading.hourMeter)} is below the ${String(earlierHigher.hourMeter)} recorded on ${fromDbDate(earlierHigher.spentOn)}`,
    );
  }
  if (laterLower?.hourMeter != null) {
    warnings.push(
      `Hour meter ${String(reading.hourMeter)} is above the ${String(laterLower.hourMeter)} recorded later on ${fromDbDate(laterLower.spentOn)}`,
    );
  }
  return warnings;
}
