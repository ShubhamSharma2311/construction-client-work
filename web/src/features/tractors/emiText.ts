import { formatDate, type IsoDate } from "../../lib/dates.ts";
import type { TagTone } from "../../ui/Tag.tsx";
import type { EmiStatus, ScheduleLine } from "./useLoans.ts";

export const EMI_STATUS_LABELS: Record<EmiStatus, string> = {
  PAID: "Paid",
  OVERDUE: "Overdue",
  DUE_TODAY: "Due today",
  UPCOMING: "Upcoming",
  CLOSED: "Closed",
};

export const EMI_STATUS_TONES: Record<EmiStatus, TagTone> = {
  PAID: "received",
  OVERDUE: "owed",
  DUE_TODAY: "partial",
  UPCOMING: "quiet",
  CLOSED: "quiet",
};

/** "5 days late", "due today", "due 5 Nov": when an EMI falls due, said the short way. */
export function dueText(
  status: EmiStatus,
  dueDate: IsoDate,
  daysLate: number,
  today: IsoDate,
): string {
  if (status === "OVERDUE") return daysLate === 1 ? "1 day late" : `${String(daysLate)} days late`;
  if (status === "DUE_TODAY") return "due today";
  return `due ${formatDate(dueDate, today)}`;
}

/** The month to pay next: the oldest one not yet paid, overdue first. */
export function nextUnpaid(schedule: ScheduleLine[]): ScheduleLine | null {
  return (
    schedule.find(
      (line) =>
        line.status === "OVERDUE" || line.status === "DUE_TODAY" || line.status === "UPCOMING",
    ) ?? null
  );
}
