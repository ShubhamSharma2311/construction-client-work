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

export const dateRangeSchema = z
  .object({ from: isoDateSchema.optional(), to: isoDateSchema.optional() })
  .refine((range) => !range.from || !range.to || range.from <= range.to, {
    message: "from must be on or before to",
    path: ["from"],
  });
