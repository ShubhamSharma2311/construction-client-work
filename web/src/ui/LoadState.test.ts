import { describe, expect, it } from "vitest";
import { ApiError } from "../api/errors.ts";
import { loadErrorMessage } from "./LoadState.tsx";

describe("loadErrorMessage", () => {
  it.each([
    [new ApiError(404, "NOT_FOUND", "Trip #9 not found"), "Trip #9 not found."],
    [new TypeError("Failed to fetch"), "Cannot reach the server. Check the internet connection."],
    [new SyntaxError("Unexpected token <"), "Something went wrong on this screen."],
  ])("words %s", (error, start) => {
    expect(loadErrorMessage(error).startsWith(start)).toBe(true);
  });
});
