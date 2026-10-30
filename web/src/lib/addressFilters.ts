import { isIsoDate } from "./dates.ts";
import { parseId } from "./ids.ts";
import type { DateRange } from "./ranges.ts";

// Lists keep their filters in the address, so Back and reload show the same list. Anything
// that does not parse is dropped rather than sent, so a mangled link shows a wider list
// instead of an error.

/** from/to, "range=all" for no dates, or the list's own default. */
export function readRange(
  params: URLSearchParams,
  defaultRange: DateRange | null,
): DateRange | null {
  if (params.get("range") === "all") return null;
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  return isIsoDate(from) && isIsoDate(to) && from <= to ? { from, to } : defaultRange;
}

export function writeRange(range: DateRange | null): Record<string, string> {
  return range ? { from: range.from, to: range.to } : { range: "all" };
}

/** An id filter as the select holds it: the id as text, or "" for all. */
export function readIdParam(params: URLSearchParams, name: string): string {
  const id = parseId(params.get(name));
  return id === null ? "" : String(id);
}

/** One of a fixed set of values, or "" for all. */
export function readChoice<T extends string>(
  params: URLSearchParams,
  name: string,
  allowed: readonly T[],
): T | "" {
  const value = params.get(name) ?? "";
  return allowed.find((candidate) => candidate === value) ?? "";
}

/** Only the filters that are set, so the address stays short. */
export function writeSet(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).filter(([, value]) => value !== ""));
}
