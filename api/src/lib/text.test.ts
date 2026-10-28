import { describe, expect, it } from "vitest";
import { z } from "zod";
import { phoneSchema, phoneSearchTerm } from "./phone.ts";
import { nameKey, nameSchema, optionalText } from "./text.ts";

describe("nameSchema", () => {
  it("trims and collapses inner spaces", () => {
    expect(nameSchema.parse("  Ram   Lal  ")).toBe("Ram Lal");
  });

  it.each(["", "   ", "x".repeat(101)])("rejects %j", (value) => {
    expect(nameSchema.safeParse(value).success).toBe(false);
  });
});

describe("nameKey", () => {
  it("matches names that differ only in case and spacing", () => {
    expect(nameKey("  Ram  LAL ")).toBe(nameKey("ram lal"));
  });
});

describe("optionalText", () => {
  const schema = z.object({ notes: optionalText(10) });

  it("stores blank text as null and keeps null and absence apart", () => {
    expect(schema.parse({ notes: "   " })).toEqual({ notes: null });
    expect(schema.parse({ notes: null })).toEqual({ notes: null });
    expect(schema.parse({})).toEqual({});
  });

  it("enforces the maximum length after trimming", () => {
    expect(schema.safeParse({ notes: "  0123456789  " }).success).toBe(true);
    expect(schema.safeParse({ notes: "01234567890" }).success).toBe(false);
  });
});

describe("phoneSchema", () => {
  it.each([
    ["9876543210", "9876543210"],
    ["+91 98765 43210", "9876543210"],
    ["+919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["98765-43210", "9876543210"],
    ["6000000000", "6000000000"],
  ])("normalises %j", (input, expected) => {
    expect(phoneSchema.parse(input)).toBe(expected);
  });

  it.each(["12345", "5876543210", "98765432101", "abcdefghij", "", "+1 9876543210"])(
    "rejects %j",
    (input) => {
      expect(phoneSchema.safeParse(input).success).toBe(false);
    },
  );
});

describe("phoneSearchTerm", () => {
  it.each([
    ["98765", "98765"],
    ["+91 98765 43210", "9876543210"],
    ["919876543210", "9876543210"],
    ["ram 1", null],
    ["ramesh", null],
    ["91", null],
  ])("turns %j into %j", (search, expected) => {
    expect(phoneSearchTerm(search)).toBe(expected);
  });
});
