import { describe, expect, it } from "vitest";
import { MAX_PAGE_SIZE, paginationSchema, toSkipTake } from "./pagination.ts";

describe("paginationSchema", () => {
  it("defaults to the first page of 50", () => {
    expect(paginationSchema.parse({})).toEqual({ page: 1, limit: 50 });
  });

  it("coerces query-string numbers", () => {
    expect(paginationSchema.parse({ page: "3", limit: "20" })).toEqual({ page: 3, limit: 20 });
  });

  it.each([{ page: "0" }, { page: "-1" }, { page: "1.5" }, { limit: "0" }, { limit: "abc" }])(
    "rejects %j",
    (query) => {
      expect(paginationSchema.safeParse(query).success).toBe(false);
    },
  );

  it(`caps the page size at ${MAX_PAGE_SIZE}`, () => {
    expect(paginationSchema.safeParse({ limit: String(MAX_PAGE_SIZE) }).success).toBe(true);
    expect(paginationSchema.safeParse({ limit: String(MAX_PAGE_SIZE + 1) }).success).toBe(false);
  });
});

describe("toSkipTake", () => {
  it("turns a page into an offset", () => {
    expect(toSkipTake({ page: 1, limit: 50 })).toEqual({ skip: 0, take: 50 });
    expect(toSkipTake({ page: 3, limit: 20 })).toEqual({ skip: 40, take: 20 });
  });
});
