import { z } from "zod";
import { AppError } from "./errors.ts";

/** The business runs on Indian time; "today" must never follow the server's clock zone. */
const BUSINESS_TIME_ZONE = "Asia/Kolkata";

export const isoDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "date must be YYYY-MM-DD")
  .refine(isRealCalendarDate, "date does not exist in the calendar")
  .brand<"IsoDate">();

export type IsoDate = z.infer<typeof isoDateSchema>;

function isRealCalendarDate(value: string): boolean {
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
}

const istDayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BUSINESS_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function todayIST(now: Date = new Date()): IsoDate {
  return istDayFormat.format(now) as IsoDate;
}

/** Postgres DATE columns come back from Prisma as UTC-midnight Dates. */
export function toDbDate(date: IsoDate): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

export function fromDbDate(date: Date): IsoDate {
  return date.toISOString().slice(0, 10) as IsoDate;
}

export interface BusinessDateBounds {
  businessStartDate: IsoDate;
  today: IsoDate;
}

/** Entries may be backdated to the business start, never dated in the future. */
export function assertBusinessDate(date: IsoDate, bounds: BusinessDateBounds): void {
  if (date > bounds.today) {
    throw new AppError("VALIDATION", `Date ${date} is in the future (today is ${bounds.today})`);
  }
  if (date < bounds.businessStartDate) {
    throw new AppError(
      "VALIDATION",
      `Date ${date} is before the business start date ${bounds.businessStartDate}`,
    );
  }
}

export const isoMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "month must be YYYY-MM")
  .brand<"IsoMonth">();

export type IsoMonth = z.infer<typeof isoMonthSchema>;

export function monthOf(date: IsoDate): IsoMonth {
  return date.slice(0, 7) as IsoMonth;
}

export function monthStart(month: IsoMonth): IsoDate {
  return `${month}-01` as IsoDate;
}

export const dateRangeSchema = z
  .object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: "from must be on or before to",
    path: ["from"],
  });

const DAY_MS = 86_400_000;

/** Whole days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: IsoDate, to: IsoDate): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / DAY_MS);
}

/** Prisma filter for a DATE column within an optional inclusive range; undefined means no limit. */
export function dayFilter(range: {
  from?: IsoDate;
  to?: IsoDate;
}): { gte?: Date; lte?: Date } | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    ...(range.from ? { gte: toDbDate(range.from) } : {}),
    ...(range.to ? { lte: toDbDate(range.to) } : {}),
  };
}

/** The month `count` months after `month` (negative goes back). */
export function addMonths(month: IsoMonth, count: number): IsoMonth {
  const [year = 0, monthNumber = 1] = month.split("-").map(Number);
  const index = year * 12 + (monthNumber - 1) + count;
  const newYear = Math.floor(index / 12);
  const newMonth = (index % 12) + 1;
  return `${String(newYear)}-${String(newMonth).padStart(2, "0")}` as IsoMonth;
}

/** A given day within a month; callers keep `day` within 1-28 so it always exists. */
export function dayOfMonth(month: IsoMonth, day: number): IsoDate {
  return `${month}-${String(day).padStart(2, "0")}` as IsoDate;
}

export function addDays(date: IsoDate, count: number): IsoDate {
  const shifted = new Date(toDbDate(date).getTime() + count * DAY_MS);
  return fromDbDate(shifted);
}

/** Noon IST on a business day: a moment that is unambiguously inside that day. */
export function noonIST(date: IsoDate): Date {
  return new Date(`${date}T06:30:00.000Z`);
}

/** An inclusive range with both ends, as reports use. */
export interface ClosedRange {
  from: IsoDate;
  to: IsoDate;
}
