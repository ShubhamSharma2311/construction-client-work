import {
  addMonths,
  daysBetween,
  monthOf,
  monthStart,
  type IsoDate,
  type IsoMonth,
} from "../../lib/dates.ts";

export function daysInMonth(month: IsoMonth): number {
  return daysBetween(monthStart(month), monthStart(addMonths(month, 1)));
}

export function lastDayOf(month: IsoMonth): IsoDate {
  return `${month}-${String(daysInMonth(month)).padStart(2, "0")}` as IsoDate;
}

export interface SalaryRate {
  effectiveFrom: IsoMonth;
  monthlyPaise: number;
}

/** The rate that applies in a month: the latest one starting on or before it. */
export function rateFor(rates: readonly SalaryRate[], month: IsoMonth): number | null {
  const applying = rates.filter((rate) => rate.effectiveFrom <= month);
  applying.sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  return applying.at(-1)?.monthlyPaise ?? null;
}

export interface Proration {
  monthlyPaise: number;
  daysInMonth: number;
  daysWorked: number;
  amountPaise: number;
}

/**
 * Salary for a month, paid in full for a whole month and by days for the month a driver
 * joined or left.
 */
export function prorate(
  monthlyPaise: number,
  month: IsoMonth,
  joinedOn: IsoDate,
  leftOn: IsoDate | null,
): Proration {
  const days = daysInMonth(month);
  const first = joinedOn > monthStart(month) ? joinedOn : monthStart(month);
  const last = leftOn && leftOn < lastDayOf(month) ? leftOn : lastDayOf(month);
  const worked =
    monthOf(first) === month && monthOf(last) === month
      ? Math.max(0, daysBetween(first, last) + 1)
      : 0;
  const amountPaise = worked === days ? monthlyPaise : Math.round((monthlyPaise * worked) / days);
  return { monthlyPaise, daysInMonth: days, daysWorked: worked, amountPaise };
}
