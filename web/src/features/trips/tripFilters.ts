import type { Ok } from "../../api/types.ts";
import { isIsoDate } from "../../lib/dates.ts";
import { parseId } from "../../lib/ids.ts";
import type { DateRange } from "../../lib/ranges.ts";

export type TripItem = Ok<"/trips", "get">["items"][number];
export type TripStatus = TripItem["status"];

export const TRIP_STATUSES = ["DUE", "PARTIAL", "PAID"] as const satisfies readonly TripStatus[];

export const TRIP_STATUS_LABELS: Record<TripStatus, string> = {
  DUE: "Due",
  PARTIAL: "Part paid",
  PAID: "Paid",
};

/** What the trips list is narrowed to; it lives in the address so Back and reload keep it. */
export interface TripFilters {
  range: DateRange | null;
  driverId: string;
  tractorId: string;
  khetId: string;
  status: TripStatus | "";
  deleted: boolean;
}

function isStatus(text: string): text is TripStatus {
  return (TRIP_STATUSES as readonly string[]).includes(text);
}

function idParam(params: URLSearchParams, name: string): string {
  const id = parseId(params.get(name));
  return id === null ? "" : String(id);
}

/**
 * Filters from the address. Anything that does not parse is dropped rather than sent, so a
 * mangled link shows a wider list instead of an error.
 */
export function readTripFilters(
  params: URLSearchParams,
  defaultRange: DateRange | null,
): TripFilters {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const status = params.get("status") ?? "";
  const range =
    params.get("range") === "all"
      ? null
      : isIsoDate(from) && isIsoDate(to) && from <= to
        ? { from, to }
        : defaultRange;
  return {
    range,
    driverId: idParam(params, "driver"),
    tractorId: idParam(params, "tractor"),
    khetId: idParam(params, "khet"),
    status: isStatus(status) ? status : "",
    deleted: params.get("deleted") === "true",
  };
}

export function writeTripFilters(filters: TripFilters): Record<string, string> {
  const params: Record<string, string> = filters.range
    ? { from: filters.range.from, to: filters.range.to }
    : { range: "all" };
  if (filters.driverId) params["driver"] = filters.driverId;
  if (filters.tractorId) params["tractor"] = filters.tractorId;
  if (filters.khetId) params["khet"] = filters.khetId;
  if (filters.status) params["status"] = filters.status;
  if (filters.deleted) params["deleted"] = "true";
  return params;
}

/** The query the API takes for these filters (without paging). */
export function tripQuery(filters: TripFilters) {
  return {
    ...(filters.range ? { from: filters.range.from, to: filters.range.to } : {}),
    ...(filters.driverId ? { driverId: Number(filters.driverId) } : {}),
    ...(filters.tractorId ? { tractorId: Number(filters.tractorId) } : {}),
    ...(filters.khetId ? { khetId: Number(filters.khetId) } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.deleted ? { deleted: "true" as const } : {}),
  };
}
