import type { Ok } from "../../api/types.ts";
import {
  readChoice,
  readIdParam,
  readRange,
  writeRange,
  writeSet,
} from "../../lib/addressFilters.ts";
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

export function readTripFilters(
  params: URLSearchParams,
  defaultRange: DateRange | null,
): TripFilters {
  return {
    range: readRange(params, defaultRange),
    driverId: readIdParam(params, "driver"),
    tractorId: readIdParam(params, "tractor"),
    khetId: readIdParam(params, "khet"),
    status: readChoice(params, "status", TRIP_STATUSES),
    deleted: params.get("deleted") === "true",
  };
}

export function writeTripFilters(filters: TripFilters): Record<string, string> {
  return {
    ...writeRange(filters.range),
    ...writeSet({
      driver: filters.driverId,
      tractor: filters.tractorId,
      khet: filters.khetId,
      status: filters.status,
      deleted: filters.deleted ? "true" : "",
    }),
  };
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
