import { describe, expect, it } from "vitest";
import { AppError } from "./errors.ts";
import {
  assertBusinessDate,
  dateRangeSchema,
  fromDbDate,
  isoDateSchema,
  toDbDate,
  todayIST,
  type IsoDate,
} from "./dates.ts";

const iso = (value: string): IsoDate => isoDateSchema.parse(value);

describe("todayIST", () => {
  it("is still the same IST day at 23:59 IST (18:29 UTC)", () => {
    expect(todayIST(new Date("2026-10-28T18:29:59Z"))).toBe("2026-10-28");
  });

  it("rolls to the next IST day at 00:01 IST (18:31 UTC)", () => {
    expect(todayIST(new Date("2026-10-28T18:31:00Z"))).toBe("2026-10-29");
  });

  it("is already the next IST day while UTC is still on the previous one", () => {
    expect(todayIST(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
  });
});

describe("isoDateSchema", () => {
  it.each(["2026-10-28", "2024-02-29", "2026-01-01"])("accepts %s", (value) => {
    expect(isoDateSchema.parse(value)).toBe(value);
  });

  it.each(["2026-02-29", "2026-02-30", "2026-13-01", "2026-00-10", "2026-4-1", "28-10-2026", ""])(
    "rejects %j",
    (value) => {
      expect(isoDateSchema.safeParse(value).success).toBe(false);
    },
  );
});

describe("DB date conversion", () => {
  it("round-trips through a UTC-midnight Date", () => {
    const date = toDbDate(iso("2026-10-28"));
    expect(date.toISOString()).toBe("2026-10-28T00:00:00.000Z");
    expect(fromDbDate(date)).toBe("2026-10-28");
  });
});

describe("assertBusinessDate", () => {
  const bounds = { businessStartDate: iso("2026-04-01"), today: iso("2026-10-28") };

  it.each(["2026-04-01", "2026-07-15", "2026-10-28"])("accepts %s", (value) => {
    expect(() => {
      assertBusinessDate(iso(value), bounds);
    }).not.toThrow();
  });

  it("rejects a future date", () => {
    expect(() => {
      assertBusinessDate(iso("2026-10-29"), bounds);
    }).toThrow(
      new AppError("VALIDATION", "Date 2026-10-29 is in the future (today is 2026-10-28)"),
    );
  });

  it("rejects a date before the business started", () => {
    expect(() => {
      assertBusinessDate(iso("2026-03-31"), bounds);
    }).toThrow("before the business start date 2026-04-01");
  });
});

describe("dateRangeSchema", () => {
  it("accepts an open range and a single day", () => {
    expect(dateRangeSchema.parse({})).toEqual({});
    expect(dateRangeSchema.parse({ from: "2026-10-01", to: "2026-10-01" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-01",
    });
  });

  it("rejects from after to", () => {
    const result = dateRangeSchema.safeParse({ from: "2026-10-02", to: "2026-10-01" });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe("from must be on or before to");
  });
});
