import { describe, expect, it } from "vitest";
import { litresSchema } from "./quantity.ts";

describe("litresSchema", () => {
  it.each([
    [45, 45_000],
    ["45.5", 45_500],
    [45.25, 45_250],
    ["0.01", 10],
    [500, 500_000],
  ])("stores %j litres as %d ml", (input, ml) => {
    expect(litresSchema.parse(input)).toBe(ml);
  });

  it.each([
    [0, "greater than zero"],
    [-3, "greater than zero"],
    ["45.125", "2 decimal places"],
    [500.01, "more than 500"],
    ["forty", "not a valid number"],
    [12345, "more than 500"],
  ])("rejects %j", (input, message) => {
    const result = litresSchema.safeParse(input);
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain(message);
  });
});
