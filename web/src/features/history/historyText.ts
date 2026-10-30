import { formatDate, type IsoDate, todayIso } from "../../lib/dates.ts";
import { formatRupees } from "../../lib/money.ts";
import type { AuditAction } from "./useHistory.ts";

type Row = Record<string, unknown>;

// Bookkeeping every row carries, or lists the entry holds that would not read as one line.
const SKIPPED = new Set(["id", "createdAt", "updatedAt", "deletedAt", "passwordHash"]);
const MIDNIGHT_UTC = /^(\d{4}-\d{2}-\d{2})T00:00:00\.000Z$/;
const LABELS: Record<string, string> = { isActive: "In use", dieselMl: "Diesel" };

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
    if (key.endsWith("Id")) return `#${String(value)}`;
    return String(value);
  }
  if (typeof value === "string") {
    const day = MIDNIGHT_UTC.exec(value)?.[1];
    if (day) return formatDate(day, today);
    // Code words such as CASH or TRACTOR_SERVICE read as plain words.
    return /^[A-Z_]+$/.test(value) ? value.replace(/_/g, " ").toLowerCase() : value;
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

/** "28 Oct, 4:26 pm" in India, with the year when it is not this one. */
export function formatMoment(at: string, today: IsoDate): string {
  const moment = new Date(at);
  return `${formatDate(todayIso(moment), today)}, ${time.format(moment).toLowerCase()}`;
}
