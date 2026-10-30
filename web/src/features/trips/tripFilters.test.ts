import { describe, expect, it } from "vitest";
import { readTripFilters, tripQuery, writeTripFilters } from "./tripFilters.ts";

const week = { from: "2026-10-26", to: "2026-10-28" };

describe("trip filters in the address", () => {
  it("round-trips every filter", () => {
    const filters = {
      range: { from: "2026-10-01", to: "2026-10-28" },
      driverId: "2",
      tractorId: "3",
      khetId: "4",
      status: "DUE" as const,
      deleted: true,
    };

    const params = new URLSearchParams(writeTripFilters(filters));

    expect(readTripFilters(params, week)).toEqual(filters);
  });

  it("starts on the default range, and remembers a choice of all time", () => {
    expect(readTripFilters(new URLSearchParams(), week).range).toEqual(week);
    expect(readTripFilters(new URLSearchParams("range=all"), week).range).toBeNull();
  });

  it.each([
    ["from=2026-10-30&to=2026-10-01", "a range that ends before it starts"],
    ["from=2026-02-31&to=2026-03-01", "a date that does not exist"],
    ["driver=abc&status=LOST&khet=-1&tractor=0", "ids and statuses that are not real"],
  ])("drops %s (%s)", (query) => {
    const filters = readTripFilters(new URLSearchParams(query), week);

    expect(filters).toEqual({
      range: week,
      driverId: "",
      tractorId: "",
      khetId: "",
      status: "",
      deleted: false,
    });
  });

  it("sends only the filters that are set, as the API expects them", () => {
    const filters = readTripFilters(
      new URLSearchParams("from=2026-10-01&to=2026-10-28&driver=2&status=PARTIAL"),
      week,
    );

    expect(tripQuery(filters)).toEqual({
      from: "2026-10-01",
      to: "2026-10-28",
      driverId: 2,
      status: "PARTIAL",
    });
  });
});
