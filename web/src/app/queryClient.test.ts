import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors.ts";
import { createQueryClient, shouldRetry } from "./queryClient.ts";

describe("retrying failed loads", () => {
  it.each([
    ["a network drop", new TypeError("Failed to fetch"), 0, true],
    ["a server error", new ApiError(503, "UNAVAILABLE", "down"), 1, true],
    ["a third failure", new ApiError(503, "UNAVAILABLE", "down"), 2, false],
    ["a refusal (4xx)", new ApiError(404, "NOT_FOUND", "gone"), 0, false],
  ])("retries %s: %s", (_label, error, failures, expected) => {
    expect(shouldRetry(failures, error)).toBe(expected);
  });

  it("never retries a save, which could enter it twice", () => {
    expect(createQueryClient().getDefaultOptions().mutations?.retry).toBe(false);
  });
});
