const TIME_ZONE = "Asia/Kolkata";

const dayLabel = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const isoDay = new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE });
const shortDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  day: "numeric",
  month: "short",
});
const weekdayDate = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  weekday: "short",
  day: "numeric",
  month: "short",
});
const monthLabel = new Intl.DateTimeFormat("en-IN", {
  timeZone: "UTC",
  month: "short",
  year: "numeric",
});

/** A business date, "2026-10-28", as the API sends and expects it. */
export type IsoDate = string;

/** "Wed, 28 Oct": the business day in India, whatever the device's own time zone. */
export function formatDayLabel(at: Date): string {
  return dayLabel.format(at);
}

/** Today's business date in India. */
export function todayIso(at: Date): IsoDate {
  return isoDay.format(at);
}

function utcDate(iso: IsoDate): Date {
  return new Date(`${iso}T00:00:00Z`);
}

/** "28 Oct", or "28 Oct 2025" when the date is not in the current year. */
export function formatDate(iso: IsoDate, today: IsoDate): string {
  const label = shortDate.format(utcDate(iso));
  return iso.slice(0, 4) === today.slice(0, 4) ? label : `${label} ${iso.slice(0, 4)}`;
}

/** "Wed, 28 Oct 2026". */
export function formatFullDate(iso: IsoDate): string {
  // Built from parts: en-IN puts a comma before the year, which reads oddly here.
  return `${weekdayDate.format(utcDate(iso))} ${iso.slice(0, 4)}`;
}

/** "Oct 2026" from "2026-10". */
export function formatMonth(isoMonth: string): string {
  return monthLabel.format(utcDate(`${isoMonth}-01`));
}

export function addDays(iso: IsoDate, days: number): IsoDate {
  const date = utcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((utcDate(to).getTime() - utcDate(from).getTime()) / 86_400_000);
}
