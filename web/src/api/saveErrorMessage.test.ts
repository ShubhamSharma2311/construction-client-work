import { describe, expect, it } from "vitest";
import { ApiError } from "./errors.ts";
import { saveErrorMessage } from "./saveErrorMessage.ts";

describe("saveErrorMessage", () => {
  it.each([
    [
      new ApiError(409, "CONFLICT", "Trip amount is below ₹3,000 already received"),
      "Trip amount is below ₹3,000 already received.",
    ],
    [
      new ApiError(400, "VALIDATION", "Request is not valid", undefined, [
        { path: "body/amount", message: "x" },
      ]),
      "Some details need fixing. See the marked fields.",
    ],
    [
      new ApiError(422, "IDEMPOTENCY_MISMATCH", "used"),
      "This entry was already saved with different details. Check the list before saving again.",
    ],
    [
      new TypeError("Failed to fetch"),
      "Cannot reach the server. Save again once connected; it will not be entered twice.",
    ],
  ])("words %s for the person", (error, message) => {
    expect(saveErrorMessage(error)).toBe(message);
  });
});
