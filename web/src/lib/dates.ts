const TIME_ZONE = "Asia/Kolkata";

const dayLabel = new Intl.DateTimeFormat("en-IN", {
  timeZone: TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
});
const istParts = new Intl.DateTimeFormat("en-GB", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
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
  // Built from parts: a locale's own date pattern has changed between browser versions.
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    istParts.formatToParts(at).find((piece) => piece.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

/** Whether text is a real calendar date in the API's form; "2026-02-31" is not. */
export function isIsoDate(text: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const date = utcDate(text);
  // An impossible month makes an invalid Date; an impossible day rolls into the next month.
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === text;
}

/** "today", "1 day", "34 days": how long ago something fell due. */
export function formatAge(days: number): string {
  if (days <= 0) return "today";
  return days === 1 ? "1 day" : `${String(days)} days`;
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
