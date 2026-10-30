import { formatDate, formatMonth, type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import type { AuditAction } from "./useHistory.ts";

type Row = Record<string, unknown>;

// Bookkeeping the API keeps on rows (times, ids, the search form of a name); not the owner's.
const SKIPPED = new Set(["id", "createdAt", "updatedAt", "deletedAt", "nameKey"]);
// A business date arrives as a plain date, or as midnight UTC from a stored row.
const DAY = /^(\d{4}-\d{2}-\d{2})(T00:00:00\.000Z)?$/;
// Fields holding the first day of a month that stands for the whole month.
const MONTH_FIELDS = new Set(["month", "emiMonth", "forMonth", "effectiveFrom", "firstEmiMonth"]);
// Fields holding the API's code words, such as CASH or TRACTOR_SERVICE; typed text keeps its case.
const CODE_FIELDS = new Set(["mode", "category", "kind", "type", "direction", "closedReason"]);
const LABELS: Record<string, string> = {
  isActive: "In use",
  dieselMl: "Diesel",
  emiMonth: "EMI month",
  shareBasisPoints: "Share",
};

const time = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function isRow(value: unknown): value is Row {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** "tripDate" reads "Trip date"; units in the key are dropped, the value carries them. */
function labelOf(key: string): string {
  const known = LABELS[key];
  if (known) return known;
  const words = key
    .replace(/(Paise|Id)$/, "")
    .replace(/([A-Z])/g, " $1")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** A field's value in words, or null when it is a list or a record without a name. */
function valueText(key: string, value: unknown, today: IsoDate): string | null {
  if (value === null || value === undefined) return "none";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value === "number") {
    if (key.endsWith("Paise")) return formatRupees(value);
    if (key.endsWith("Ml")) return `${String(value / 1000)} L`;
    if (key === "shareBasisPoints") return `${String(value / 100)}%`;
    if (key.endsWith("Id")) return `#${String(value)}`;
    return String(value);
  }
  if (typeof value === "string") {
    const day = DAY.exec(value)?.[1];
    if (day) return MONTH_FIELDS.has(key) ? formatMonth(day.slice(0, 7)) : formatDate(day, today);
    return CODE_FIELDS.has(key) ? value.replace(/_/g, " ").toLowerCase() : value;
  }
  if (isRow(value)) {
    const name = value["name"] ?? value["regNumber"];
    return typeof name === "string" ? name : null;
  }
  return null;
}

/** An id field says nothing a name next to it does not, so it is shown only on its own. */
function hasNamedSibling(key: string, before: Row, after: Row): boolean {
  const base = key.replace(/Id$/, "");
  return key.endsWith("Id") && (isRow(before[base]) || isRow(after[base]));
}

/**
 * What an entry's history line says changed. An edit lists each changed field, before and
 * after; an entry added or deleted gives its amount, when it has one.
 */
export function changeLines(
  action: AuditAction,
  before: unknown,
  after: unknown,
  today: IsoDate,
): string[] {
  if (action !== "UPDATE") {
    const row = action === "DELETE" ? before : after;
    if (!isRow(row) || typeof row["amountPaise"] !== "number") return [];
    return [`Amount: ${formatRupees(row["amountPaise"])}`];
  }
  if (!isRow(before) || !isRow(after)) return [];
  const credit = after["appliedToTrips"];
  if (Array.isArray(credit)) return creditLines(credit);
  const lines: string[] = [];
  for (const key of Object.keys(after)) {
    if (SKIPPED.has(key) || hasNamedSibling(key, before, after)) continue;
    const was = valueText(key, before[key], today);
    const now = valueText(key, after[key], today);
    if (was === null || now === null || was === now) continue;
    lines.push(`${labelOf(key)}: ${was} → ${now}`);
  }
  return lines.length > 0 ? lines : ["Saved with no change"];
}

/** A customer's credit set against their due trips, as the API records it. */
function creditLines(lines: unknown[]): string[] {
  return lines.filter(isRow).map((line) => {
    const trip = typeof line["tripId"] === "number" ? ` #${String(line["tripId"])}` : "";
    const amount = typeof line["amountPaise"] === "number" ? formatRupees(line["amountPaise"]) : "";
    return `Set against trip${trip}: ${amount}`;
  });
}

/** "28 Oct, 4:26 pm" in India, with the year when it is not this one. */
export function formatMoment(at: string, today: IsoDate): string {
  const moment = new Date(at);
  return `${formatDate(todayIso(moment), today)}, ${time.format(moment).toLowerCase()}`;
}
