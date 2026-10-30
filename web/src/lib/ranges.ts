import { addDays, type IsoDate } from "./dates.ts";

export interface DateRange {
  from: IsoDate;
  to: IsoDate;
}

export const RANGE_PRESETS = ["today", "week", "month", "lastMonth", "all"] as const;
export type RangePreset = (typeof RANGE_PRESETS)[number];

export const RANGE_LABELS: Record<RangePreset, string> = {
  today: "Today",
  week: "This week",
  month: "This month",
  lastMonth: "Last month",
  all: "All time",
};

function monthStart(day: IsoDate): IsoDate {
  return `${day.slice(0, 7)}-01`;
}

/** The dates a preset covers, counted in the business's own days; "all" has no bounds. */
export function presetRange(preset: RangePreset, today: IsoDate): DateRange | null {
  switch (preset) {
    case "today":
      return { from: today, to: today };
    case "week": {
      // Weeks start on Monday. getUTCDay is 0 on Sunday.
      const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
      return { from: addDays(today, -((weekday + 6) % 7)), to: today };
    }
    case "month":
      return { from: monthStart(today), to: today };
    case "lastMonth": {
      const lastDay = addDays(monthStart(today), -1);
      return { from: monthStart(lastDay), to: lastDay };
    }
    case "all":
      return null;
  }
}

/** Which preset a from/to pair is, if any, so the matching chip shows as picked. */
export function matchPreset(range: DateRange | null, today: IsoDate): RangePreset | null {
  return (
    RANGE_PRESETS.find((preset) => {
      const candidate = presetRange(preset, today);
      return candidate === null
        ? range === null
        : range?.from === candidate.from && range.to === candidate.to;
    }) ?? null
  );
}

/**
 * The dates a report can cover: nothing exists before the business started or after today, so
 * a range is cut to fit, all time runs from the start to today, and a range wholly outside is null.
 */
export function businessDates(
  range: DateRange | null,
  startDate: IsoDate,
  today: IsoDate,
): DateRange | null {
  if (!range) return { from: startDate, to: today };
  if (range.to < startDate || range.from > today) return null;
  return {
    from: range.from < startDate ? startDate : range.from,
    to: range.to > today ? today : range.to,
  };
}

/** The last `days` days of a range, counting both ends, for reports capped in length. */
export function lastDays(range: DateRange, days: number): DateRange {
  const earliest = addDays(range.to, -(days - 1));
  return { from: range.from < earliest ? earliest : range.from, to: range.to };
}
