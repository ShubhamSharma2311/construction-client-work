import { describe, expect, it } from "vitest";
import { parseId } from "./WithId.tsx";

describe("parseId", () => {
  it.each([
    ["7", 7],
    ["123456789", 123456789],
  ])("reads %j", (text, id) => {
    expect(parseId(text)).toBe(id);
  });

  it.each([undefined, "", "0", "-1", "abc", "1.5", "1234567890", "7 "])("refuses %j", (text) => {
    expect(parseId(text)).toBeNull();
  });
});
