import { daysBetween, type IsoDate } from "../../lib/dates.ts";
import { AppError } from "../../lib/errors.ts";
import type { Db, Tx } from "../../lib/prisma.ts";
import { getBusinessBounds } from "../settings/settings.service.ts";

export const MAX_DAYWISE_DAYS = 366;

/** A report cannot start before the business did; day-wise ones are capped at a year. */
export async function assertReportRange(
  db: Db | Tx,
  range: { from?: IsoDate; to?: IsoDate },
  now: Date,
  options: { maxDays?: number } = {},
): Promise<void> {
  const bounds = await getBusinessBounds(db, now);
  if (range.from && range.from < bounds.businessStartDate) {
    throw new AppError(
      "VALIDATION",
      `The report starts ${range.from}, before the business start ${bounds.businessStartDate}`,
    );
  }
  if (
    options.maxDays &&
    range.from &&
    range.to &&
    daysBetween(range.from, range.to) + 1 > options.maxDays
  ) {
    throw new AppError(
      "VALIDATION",
      `Pick at most ${String(options.maxDays)} days for a day-wise report`,
    );
  }
}
